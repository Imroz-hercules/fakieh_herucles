"""Provider-agnostic text generation.

The AI Assistant does not care *which* model answers — it asks for text and
gets text. We try providers in order (default: Gemini, then Claude) and use the
first one that has a key and succeeds. This lets the demo run for free on a
Google AI Studio key, and upgrade to Claude by just adding ANTHROPIC_API_KEY.

Keys are read from the environment (a Backend/.env file is loaded if present):
  * GEMINI_API_KEY (or GOOGLE_API_KEY) — free from https://aistudio.google.com
  * ANTHROPIC_API_KEY                  — from https://console.anthropic.com

Nothing here imports an SDK at module load, so a missing package or key never
breaks the app — that provider is simply skipped.
"""

from __future__ import annotations

import concurrent.futures
import os
from typing import Any


def _load_env_file() -> None:
    """Load Backend/.env without requiring python-dotenv."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path)
        return
    except Exception:
        pass
    try:
        with open(env_path, encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key:
                    # .env is source of truth for local AI keys.
                    os.environ[key] = val
    except Exception:
        pass


_load_env_file()


# "gemini-flash-lite-latest" is a fast, free-tier alias that answers in ~1s
# (the non-lite flash alias currently routes to a slow thinking model).
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# Hard wall-clock cap (seconds) on a single provider call. Without this, a
# slow/hanging upstream (e.g. a "thinking" model variant, or a dead network
# path) blocks the Flask worker indefinitely — see bug B4. Enforced two
# ways: as a native per-request timeout passed to each SDK/HTTP call, and as
# a backstop via ThreadPoolExecutor in generate() below, so even a call that
# ignores its own timeout still returns control to the caller.
AI_REQUEST_TIMEOUT_SEC = float(os.getenv("AI_REQUEST_TIMEOUT_SEC", "20"))

# Comma-separated order, e.g. "gemini,deepseek,claude".
PROVIDER_ORDER = [
    p.strip().lower()
    for p in os.getenv("AI_PROVIDER_ORDER", "gemini,deepseek,claude").split(",")
    if p.strip()
]


def _gemini_key() -> str | None:
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


def _anthropic_key() -> str | None:
    return os.getenv("ANTHROPIC_API_KEY")


def _deepseek_key() -> str | None:
    return os.getenv("DEEPSEEK_API_KEY")


def _usage(
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
) -> dict[str, int | None]:
    if total_tokens is None and prompt_tokens is not None and completion_tokens is not None:
        total_tokens = prompt_tokens + completion_tokens
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def _call_gemini(system: str, prompt: str, temperature: float) -> tuple[str, dict[str, Any]]:
    from google import genai
    from google.genai import types

    # HttpOptions.timeout is in MILLISECONDS (verified against the installed
    # google-genai SDK — google/genai/types.py: "Timeout for the request in
    # milliseconds."), hence the *1000 below.
    client = genai.Client(
        api_key=_gemini_key(),
        http_options=types.HttpOptions(timeout=int(AI_REQUEST_TIMEOUT_SEC * 1000)),
    )

    def _config(disable_thinking: bool):
        cfg = types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            max_output_tokens=1200,
        )
        if disable_thinking:
            # Disabling thinking cuts latency from ~20s to ~1s on flash models.
            cfg.thinking_config = types.ThinkingConfig(thinking_budget=0)
        return cfg

    try:
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=prompt, config=_config(True))
    except Exception:
        # Some models reject thinking_budget=0 — retry without it.
        resp = client.models.generate_content(model=GEMINI_MODEL, contents=prompt, config=_config(False))

    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response")

    meta = getattr(resp, "usage_metadata", None)
    usage = _usage(
        prompt_tokens=getattr(meta, "prompt_token_count", None) if meta else None,
        completion_tokens=getattr(meta, "candidates_token_count", None) if meta else None,
        total_tokens=getattr(meta, "total_token_count", None) if meta else None,
    )
    return text, usage


def _call_claude(system: str, prompt: str, temperature: float) -> tuple[str, dict[str, Any]]:
    import anthropic

    client = anthropic.Anthropic(api_key=_anthropic_key(), timeout=AI_REQUEST_TIMEOUT_SEC)
    resp = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1400,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
    text = "\n".join(parts).strip()
    if not text:
        raise RuntimeError("Claude returned an empty response")

    u = getattr(resp, "usage", None)
    usage = _usage(
        prompt_tokens=getattr(u, "input_tokens", None) if u else None,
        completion_tokens=getattr(u, "output_tokens", None) if u else None,
    )
    return text, usage


def _call_deepseek(system: str, prompt: str, temperature: float) -> tuple[str, dict[str, Any]]:
    # DeepSeek is OpenAI-API-compatible; call it with plain requests to avoid
    # any SDK/httpx version conflicts.
    import requests

    resp = requests.post(
        f"{DEEPSEEK_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {_deepseek_key()}",
            "Content-Type": "application/json",
        },
        json={
            "model": DEEPSEEK_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": 1200,
            "stream": False,
        },
        timeout=AI_REQUEST_TIMEOUT_SEC,
    )
    resp.raise_for_status()
    data = resp.json()
    text = (data["choices"][0]["message"]["content"] or "").strip()
    if not text:
        raise RuntimeError("DeepSeek returned an empty response")

    u = data.get("usage") or {}
    usage = _usage(
        prompt_tokens=u.get("prompt_tokens"),
        completion_tokens=u.get("completion_tokens"),
        total_tokens=u.get("total_tokens"),
    )
    return text, usage


# Shared pool used only to enforce AI_REQUEST_TIMEOUT_SEC as a hard backstop
# (see generate() below). A stuck call cannot be killed outright in Python,
# but future.result(timeout=...) still hands control back to the caller on
# schedule, so a hung provider leaks one idle worker thread instead of
# blocking the Flask request forever.
_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="ai-provider")


_HANDLERS = {
    "gemini": (_gemini_key, _call_gemini, GEMINI_MODEL),
    "deepseek": (_deepseek_key, _call_deepseek, DEEPSEEK_MODEL),
    "claude": (_anthropic_key, _call_claude, ANTHROPIC_MODEL),
}


def available_providers() -> list[dict]:
    """Report which providers have a key configured (for the /health endpoint)."""
    out = []
    for name in PROVIDER_ORDER:
        handler = _HANDLERS.get(name)
        if not handler:
            continue
        key_fn, _, model = handler
        out.append({"provider": name, "model": model, "configured": bool(key_fn())})
    return out


def any_configured() -> bool:
    return any(p["configured"] for p in available_providers())


def generate(system: str, prompt: str, temperature: float = 0.25) -> dict:
    """Generate text using the first available provider.

    Returns ``{"text", "provider", "model", "ok", "errors", "usage"}``.
    ``usage`` is ``{prompt_tokens, completion_tokens, total_tokens}`` when the
    provider reports it. On total failure ``ok`` is False and the caller should
    fall back to a cached answer.
    """
    errors: list[str] = []
    for name in PROVIDER_ORDER:
        handler = _HANDLERS.get(name)
        if not handler:
            continue
        key_fn, call_fn, model = handler
        if not key_fn():
            continue
        try:
            future = _EXECUTOR.submit(call_fn, system, prompt, temperature)
            text, usage = future.result(timeout=AI_REQUEST_TIMEOUT_SEC)
            return {
                "text": text,
                "provider": name,
                "model": model,
                "ok": True,
                "errors": errors,
                "usage": usage,
            }
        except concurrent.futures.TimeoutError:
            errors.append(f"{name}: timed out after {AI_REQUEST_TIMEOUT_SEC:.0f}s")
        except Exception as exc:  # try the next provider
            errors.append(f"{name}: {exc}")

    return {
        "text": "",
        "provider": None,
        "model": None,
        "ok": False,
        "errors": errors,
        "usage": None,
    }
