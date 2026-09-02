/**
 * Proves the LUT stage of the post-processing chain (`PostFx.tsx`, `lut.ts`)
 * is what it claims to be:
 *
 *   1. A NEUTRAL `LookupTexture`, in the exact chain position this app uses
 *      it (after N8AO/SMAA/TiltShift/ToneMapping — see `PostFx.tsx`'s own
 *      header for why LUT sits AFTER tone mapping), is a no-op against
 *      having no LUT effect in the chain at all — measured as the MEAN
 *      per-channel difference over several thousand sampled pixels (see
 *      "HOW" below for why mean, not a raw per-pixel max).
 *   2. The REAL grade (`makeCoolNeutralLUT`) is NOT a no-op — proving check 1
 *      can actually fail, per this project's standing rule that "every new
 *      check must be proven to fail against its target before it is
 *      trusted." A check that can only ever pass is not a check.
 *
 *   node scripts/verify-lut.mjs
 *
 * Exit codes match the other lanes:
 *   0  both checks ran and passed
 *   1  check 1 failed (the neutral LUT changed pixels on average) — OR
 *      check 2 failed (the real grade did NOT change pixels meaningfully,
 *      meaning check 1 is vacuous)
 *   2  the checks could not run at all (no browser, no dev server, no
 *      renderer)
 *
 * HOW
 * ---
 * A `window.__plant3dLutMode` DEV-only override (`PostFx.tsx`) lets this
 * script swap the chain's LUT between three states without a rebuild:
 *   undefined  -> the real cool-neutral grade (production default)
 *   'neutral'  -> `makeNeutralLUT()`, an identity 3D LUT
 *   'off'      -> no `<LUT>` effect in the chain at all (the baseline)
 * The SAME page, the same camera, the same data — only the LUT stage
 * changes between captures, so any pixel difference is attributable to it
 * and nothing else. Pixels are read back from the live WebGL canvas (via a
 * 2D-canvas `drawImage`/`getImageData` round trip, the same technique
 * `verify-picture.mjs` uses) and STRIDE-sampled rather than read in full —
 * full-resolution RGBA at 1280x495 is ~2.5 MB per capture, which the CDP
 * `Runtime.evaluate` JSON round trip handles but does not need to: a
 * LUT-identity claim is just as provable, and just as disprovable, from
 * several thousand evenly-spaced samples as from every single pixel — the
 * grade in `lut.ts` is smooth and low-frequency by construction (a 6%
 * contrast curve and a 3% split-tone), so it has no way to hide from a
 * regular sampling grid the way single-pixel noise could.
 *
 * MEAN, not max: an earlier version of this script compared 'off' against
 * 'neutral' by raw per-pixel MAX difference and it was not sound — measured
 * here, `N8AO`'s half-res denoise carries its own frame-to-frame dither
 * entirely independent of the LUT, so even with the LUT genuinely behaving
 * as a no-op a handful of outlier channel values reached 11/255 while the
 * MEAN difference over the same ~15,000 channel samples was 0.003/255. Mean
 * is what actually isolates "did the LUT change the image" from "does an
 * unrelated pass have inherent per-frame jitter"; see `diffStats`'s own
 * comment for the full measurement.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5199';
const URL_3D = `${BASE}/fakieh/plant-3d?fx=on`;
const PORT = 9200 + Math.floor(Math.random() * 8000);
const WIDTH = 1280;
const HEIGHT = 495;
const DPR = 1;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ran = 0;
let failed = 0;
function check(name, problem) {
  ran += 1;
  if (problem) {
    failed += 1;
    console.log(`FAIL  ${name}\n      ${problem}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    });
  }
  send(method, params = {}, sessionId) {
    const id = (this.id += 1);
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      setTimeout(() => {
        if (this.pending.delete(id)) rej(new Error(`${method} timed out`));
      }, 120_000);
    });
  }
}

async function evaluate(cdp, session, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
  if (r.exceptionDetails) {
    throw new Error(`page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  }
  return r.result.value;
}

/**
 * Pumps rendered frames, THEN samples every 9th pixel in both axes
 * (~7,900 samples at 1280x495) of the live WebGL canvas.
 *
 * Frames are pumped by calling `state.advance()` directly — a headless
 * background tab does not reliably tick `requestAnimationFrame` on its own
 * (measured here: a plain real-time sleep after flipping
 * `window.__plant3dLutMode` left the canvas at its cleared, never-rendered
 * state — [0,0,0,0] everywhere — even after several seconds; `verify-
 * picture.mjs`'s own `CONVERGE` script exists for exactly this reason, and
 * this is the same fix applied here). `state.advance(timestamp)` is a real
 * `@react-three/fiber` `RootState` API for exactly this: forcing one r3f
 * render tick outside the normal rAF loop.
 */
const PUMP_AND_SAMPLE_SRC = `
(async () => {
  const s = window.__plant3d;
  if (!s) return { error: 'no renderer on the page' };
  for (let i = 0; i < 24; i += 1) {
    s.advance(performance.now() + i * 16);
    await new Promise((r) => setTimeout(r, 30));
  }
  const canvas = s.gl.domElement;
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return { error: 'canvas has zero size' };
  const buf = document.createElement('canvas');
  buf.width = w; buf.height = h;
  const ctx = buf.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const STRIDE = 9;
  const samples = [];
  for (let y = 0; y < h; y += STRIDE) {
    for (let x = 0; x < w; x += STRIDE) {
      const i = (y * w + x) * 4;
      samples.push(data[i], data[i + 1], data[i + 2]);
    }
  }
  return { w, h, count: samples.length / 3, samples };
})()
`;

/**
 * `max` alone is not a sound "is this a no-op" statistic on TWO SEPARATELY
 * RENDERED frames of a live scene, even with everything else held fixed
 * (same camera, same look, same data): measured here, `N8AO`'s half-res
 * denoise carries its own frame-to-frame dither, independent of the LUT
 * entirely — comparing 'off' against 'neutral' with the LUT genuinely
 * behaving as a no-op still showed a handful of outlier channel values up to
 * 11/255, while the MEAN difference over the same ~15,000 channel values was
 * 0.003/255. `mean` is what actually isolates "did the LUT change the
 * image" from "does an unrelated pass have inherent per-frame jitter" — a
 * few dozen dithered pixels move the max a lot and the mean almost not at
 * all, and a real colour grade (see `gradedVsOff` below, mean 6.68/255) does
 * the opposite. `outlierFrac` (the share of channel samples further than
 * 1/255 apart) is reported alongside as a second, independent view of the
 * same distinction.
 */
function diffStats(a, b) {
  if (a.length !== b.length) throw new Error(`sample length mismatch: ${a.length} vs ${b.length}`);
  let max = 0;
  let sum = 0;
  let outliers = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
    sum += d;
    if (d > 1) outliers += 1;
  }
  return { max, mean: sum / a.length, outlierFrac: outliers / a.length };
}

/** Sets the LUT mode, then pumps and samples frames (see
 *  `PUMP_AND_SAMPLE_SRC`) — the DEV poll in `PostFx.tsx` picks the mode
 *  change up once a rendered frame via `useFrame`, and `EffectComposer`'s
 *  own pass rebuild runs in a `useLayoutEffect` keyed on `children`
 *  identity, so at least one commit + one render has to actually happen
 *  between setting the mode and reading pixels. */
async function setLutModeAndCapture(cdp, session, mode) {
  const setExpr =
    mode === undefined
      ? 'delete window.__plant3dLutMode; true'
      : `window.__plant3dLutMode = ${JSON.stringify(mode)}; true`;
  await evaluate(cdp, session, setExpr);
  const result = await evaluate(cdp, session, PUMP_AND_SAMPLE_SRC);
  if (result.error) throw new Error(`capture (${mode ?? 'grade'}): ${result.error}`);
  return result;
}

async function main() {
  const chrome = CHROMES.find((p) => existsSync(p));
  if (!chrome) {
    console.error('COULD NOT RUN — no Chrome or Edge found');
    process.exit(2);
  }
  const profile = join(tmpdir(), `plant3d-lut-${process.pid}`);
  await mkdtemp(join(tmpdir(), 'plant3d-lut-'));

  const child = spawn(
    chrome,
    [
      '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
      `--window-size=${WIDTH},${HEIGHT}`, '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', '--disable-extensions', '--mute-audio',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  try {
    let wsUrl = null;
    for (let i = 0; i < 60 && !wsUrl; i += 1) {
      await sleep(250);
      try {
        wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
      } catch {
        /* not up yet */
      }
    }
    if (!wsUrl) throw new Error('browser never opened a debug port');

    const ws = new WebSocket(wsUrl);
    await new Promise((ok, bad) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', () => bad(new Error('debug socket failed')), { once: true });
    });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, session);
    await cdp.send('Runtime.enable', {}, session);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: false },
      session,
    );

    await cdp.send('Page.navigate', { url: URL_3D }, session);
    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) {
      await sleep(500);
      ready = await evaluate(cdp, session, 'Boolean(window.__plant3d)').catch(() => false);
    }
    if (!ready) throw new Error('the 3D view never created a renderer within 60s');
    /* Let the scene settle — data load, environment bake, first shadow pass —
       before the first capture. A real-time sleep alone does not do this: a
       headless background tab does not reliably tick its own rAF loop (see
       `PUMP_AND_SAMPLE_SRC`'s header), so this pumps frames the same way. */
    await evaluate(cdp, session, `
      (async () => {
        const s = window.__plant3d;
        if (!s) return false;
        for (let i = 0; i < 40; i += 1) { s.advance(performance.now() + i * 16); await new Promise((r) => setTimeout(r, 30)); }
        return true;
      })()
    `);

    console.log(`      base: ${BASE}   canvas: ${WIDTH}x${HEIGHT} @ dpr ${DPR}   stride 9`);

    const off = await setLutModeAndCapture(cdp, session, 'off');
    console.log(`      captured 'off'     (no LUT effect)      ${off.count} samples`);
    const neutral = await setLutModeAndCapture(cdp, session, 'neutral');
    console.log(`      captured 'neutral' (identity LookupTexture) ${neutral.count} samples`);
    const graded = await setLutModeAndCapture(cdp, session, undefined);
    console.log(`      captured (default) (the real cool-neutral grade) ${graded.count} samples`);

    const neutralVsOff = diffStats(off.samples, neutral.samples);
    const gradedVsOff = diffStats(off.samples, graded.samples);

    const fmt = (s) =>
      `max ${s.max.toFixed(2)}/255   mean ${s.mean.toFixed(3)}/255   `
      + `outliers(>1/255) ${(s.outlierFrac * 100).toFixed(2)}%`;
    console.log(`      neutral vs off:  ${fmt(neutralVsOff)}`);
    console.log(`      graded  vs off:  ${fmt(gradedVsOff)}`);

    /* MEAN, not max — see the note on `diffStats` for why max alone is not
       sound across two separately-rendered frames. 0.2/255 is roughly 65x
       above this run's own measured neutral-vs-off noise floor (mean
       0.003/255) and roughly 30x below the real grade's own signal (mean
       6.68/255) — comfortable margin on both sides, not a threshold tuned to
       exactly clear one run. */
    const MEAN_NOOP_FLOOR = 0.2;
    check(
      `a neutral LUT, in the real chain position, is a no-op on average (mean <= ${MEAN_NOOP_FLOOR}/255)`,
      neutralVsOff.mean > MEAN_NOOP_FLOOR
        ? `mean per-channel diff ${neutralVsOff.mean.toFixed(3)}/255 exceeds the ${MEAN_NOOP_FLOOR}/255 floor — `
          + 'the LUT stage (or its position in the chain) is not neutral-safe'
        : null,
    );

    /*
     * The proof the check above is not vacuous: the SAME comparison, against
     * the SAME baseline, with the real (non-neutral) grade in place instead
     * of the identity LUT, must show a REAL difference — well past both the
     * no-op floor above and this run's own measured noise floor.
     */
    const GRADE_SIGNAL_FLOOR = MEAN_NOOP_FLOOR * 4;
    check(
      `the real grade is measurably NOT a no-op (mean > ${GRADE_SIGNAL_FLOOR}/255 — proves the check above can fail)`,
      gradedVsOff.mean <= GRADE_SIGNAL_FLOOR
        ? `graded-vs-off mean diff (${gradedVsOff.mean.toFixed(3)}/255) does not clear ${GRADE_SIGNAL_FLOOR}/255 — `
          + 'the grade would not be caught if it silently regressed to identity'
        : null,
    );
  } finally {
    child.kill();
  }

  console.log(`\n${ran} checks run, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('COULD NOT RUN —', err && err.stack ? err.stack : err);
  process.exit(2);
});
