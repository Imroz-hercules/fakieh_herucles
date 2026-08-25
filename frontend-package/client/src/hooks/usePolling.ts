import { useEffect, useRef } from "react";

/**
 * Calls `fn` immediately, then every `intervalMs`, but never overlaps:
 * if the previous run is still in flight, the tick is skipped.
 *
 * Each run receives an AbortSignal that is aborted on unmount (or when the
 * hook is disabled), so in-flight requests are cancelled instead of resolving
 * against an unmounted component.
 *
 * Why: several pages used `setInterval(fetchX, 5000)` with no in-flight guard.
 * When the backend took longer than the interval, requests stacked up, filled
 * the browser's per-origin connection slots and starved asset/JS requests
 * (logos and chunks queued behind pending XHR).
 */
export function usePolling(
  fn: (signal: AbortSignal) => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    // One controller for the lifetime of the effect: aborting it on cleanup
    // cancels whatever run is in flight. We do NOT abort between ticks, since
    // a tick only starts when the previous one has finished.
    const controller = new AbortController();

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await fnRef.current(controller.signal);
      } catch (e) {
        const name = (e as { name?: string })?.name;
        if (name === "AbortError" || name === "CanceledError") return;
        // Other errors are the caller's responsibility to surface.
      } finally {
        inFlight = false;
      }
    };

    void tick();
    timer = setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      controller.abort();
    };
  }, [intervalMs, enabled]);
}

export default usePolling;
