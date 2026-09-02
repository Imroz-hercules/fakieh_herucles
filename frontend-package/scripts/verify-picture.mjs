/**
 * Checks about the PICTURE, not the model.
 *
 *   node scripts/verify-picture.mjs
 *
 * Exit codes match the other lanes, for the same reason:
 *   0  every check ran and passed
 *   1  at least one check failed
 *   2  the checks could not run at all
 *
 * WHY THIS EXISTS
 * ---------------
 * `verify-plant3d.mjs` has 36 checks and every one of them passed through four
 * separate visual rejections by the client. An audit put its finger on exactly
 * why: not one of those checks measures projected silo size, visible subject
 * area, or whether silos rendered at all. They verify the MODEL — capacities,
 * counts, volumes, overlaps, shader splices. A completely green run there is
 * compatible with a `SiloGroupMesh` that returns null and a canvas showing
 * nothing but ground.
 *
 * The client's four rejections were, in their own words, "the world is too big
 * and the silos are too small", "barely able to see them", and "silos look real
 * bad". Those are statements about an image. Nothing in this repository could
 * have contradicted them, or confirmed them, or noticed if they got worse. This
 * file is the attempt to make them measurable.
 *
 * HOW IT MEASURES — and why not by looking at colours
 * ---------------------------------------------------
 * Classifying "silo pixels" by colour is a trap: the silos are grey, the ground
 * is grey, the sky is grey, and any threshold that separates them today is one
 * lighting change from separating something else. So nothing here classifies.
 *
 * Instead it renders a MASK pass: everything that is not a silo is switched
 * off, the frame is cleared to black, and whatever is left is the silos, by
 * construction, at any contrast. That gives an exact mask to count (coverage)
 * and bound (projected size), and it keeps working through any amount of art
 * direction.
 *
 * The first version of this did diff two frames — normal, and with the silos
 * hidden — and called the changed pixels the silos. It is recorded here because
 * it was wrong in an instructive way: where a dark bin stands against the dark
 * interior wall behind it the two frames barely differ, so most of a large and
 * perfectly visible bank of 48 bins fell under the difference threshold and the
 * check reported the subject as 3.85% of the frame. Comparing the number with
 * the actual screenshot is the only reason that was caught.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It cannot tell you the picture is good. Composition, palette and mood are not
 * in here and should not be faked in here. What it can do is refuse to let the
 * measurable part of "barely able to see them" get worse without anyone
 * noticing, and catch the whole class of failure where the view renders nothing
 * and every other lane still reports success.
 *
 * The thresholds are FLOORS AGAINST REGRESSION, set below values measured on a
 * build the client has not yet approved. Passing is not a claim that the
 * picture is right. Failing is a claim that it got worse.
 *
 * ---------------------------------------------------------------------------
 * EXTENSION — mid-tones, histogram shape, silo contrast, material colour
 * ---------------------------------------------------------------------------
 * The three original checks answer "did the silos render, and are they big
 * enough". They say nothing about TONE: a silo bank can pass every one of them
 * while sitting in a picture that is crushed to shadow at both ends, or where
 * every material reads as the same grey blob. DESIGN.md states the target
 * directly ("mid-tones must stay >= 30% day / >= 22% dusk") and the overhaul
 * plan (workstream D, "today 9% / 8%") already knows today's build fails it.
 * Four checks were added to make that measurable the same way the first three
 * are: a floor against regression, proven to be able to fail.
 *
 *   1. Mid-tone share — fraction of pixels with luminance in [0.25, 0.75],
 *      over the FULL COMPOSED frame (not the mask — this is a statement about
 *      the whole picture, sky and ground included, same as DESIGN.md's own
 *      wording). Measured per view (whole site + every zone) in daylight, and
 *      for whole site only at dusk (night is exempt — DESIGN.md sets no floor
 *      for it, and a deliberately dark look should not be graded against a
 *      daylight target).
 *   2. Histogram shape — the same full-frame luminance, bucketed into ten
 *      deciles, checked three ways at once because a single per-bucket cap is
 *      not enough: "no decile > 30%" happily passes a picture with two
 *      separated ~25% peaks either side of a dark trough, a textbook bimodal
 *      histogram (a Codex audit of an earlier draft caught exactly this).
 *      So: (a) the original per-bucket cap, which still catches a crushed or
 *      blown-out frame; (b) the share of pixels in DECILES 3-7, 1-based —
 *      luminance [0.2, 0.7) — which a split-peak histogram starves even when
 *      no single bucket trips the cap; (c) Sarle's bimodality coefficient,
 *      `(skewness^2 + 1) / kurtosis` over the full luminance distribution,
 *      which is shape-sensitive rather than bucket-sensitive and catches a
 *      split that happens to straddle a bucket boundary.
 *   3. Silo tonal range — p90 minus p10 of luminance, over MASK-identified
 *      silo pixels only (see the coverage check above for what "mask" means
 *      and why). A subject can sit inside a mid-toned picture and still read
 *      as a flat grey slab if it carries no contrast of its own; this is the
 *      check for that, independent of check 1.
 *   4. Material separability — NOT a per-pixel colour-hit-count. For each
 *      material actually present in the current zone (per `GET /api/silos`
 *      joined against `silos.ts`'s silo -> zone mapping — see
 *      `zoneMaterialNames` below), this computes the MEDIAN rendered colour
 *      of its matched silo-mask pixels (pixels within `deltaEWindow` of that
 *      material's legend swatch, CIEDE2000 — `deltaE00` in
 *      `lib/picture-metrics.mjs`), then asks two questions: does each
 *      material's rendered median land within `deltaEWindow` of its own
 *      swatch, and — the actual separability question — is the SMALLEST
 *      pairwise ΔE00 between the rendered medians at least
 *      `minPairwiseRatio` of the smallest pairwise ΔE00 between the target
 *      swatches. A per-pixel hit count cannot tell "two materials render as
 *      indistinguishable smudges that both happen to be near their own
 *      swatch" from "the materials are genuinely separable on screen"; the
 *      pairwise comparison can. Only enforced on the Raw Material and Outside
 *      Yard zones (the two zone views this file already had a floor for that
 *      are also the ones the plant currently reports live material codes
 *      into). Not colour classification of the kind the header above warns
 *      against: nothing here decides what a silo IS from its colour, only
 *      whether the materials the model says should be on screen actually
 *      read as different things to a person looking at it.
 *
 * MASK CORRECTION — not every InstancedMesh is a silo
 * ---------------------------------------------------
 * The coverage/box checks above (and the tonal/material checks that reuse
 * their mask) originally masked EVERY visible `InstancedMesh` with instances,
 * which is wrong the moment the scene has an instanced fence, truss, or
 * beacon atlas that is not a silo — exactly what the geometry workstream (B)
 * adds. The mask now prefers meshes explicitly tagged `userData.silo === true`
 * (or a name starting `silo:`); until that tag exists in the running build it
 * falls back to the old "any InstancedMesh with instances" rule, and SAYS SO —
 * every run prints which rule was used and how many meshes it masked, and a
 * mask that resolves to zero meshes under either rule is a COULD NOT RUN
 * (exit 2), not a silent zero.
 *
 * All four read their floors from `THRESHOLDS`, which starts as
 * `DEFAULT_THRESHOLDS` (`lib/picture-metrics.mjs`) and can be overridden
 * wholesale by setting `PICTURE_THRESHOLDS_JSON` to a JSON object that is
 * deep-merged over the defaults — including `materialSeparability.
 * swatchOverride`, a map of legend material name -> "#rrggbb" used to force
 * check 4 to measure against a colour nothing on screen is actually rendered
 * in. That override exists ONLY to let this file prove check 4 can fail; it is
 * not a tuning knob for real thresholds, which live in the `midtone` /
 * `histogram` / `siloTonalRange` / `materialSeparability.deltaEWindow` /
 * `materialSeparability.minPixels` keys instead.
 *
 * Every one of the four is measured and printed as a NUMBER whether it passes
 * or fails — a check that only speaks when it fails is a check nobody can use
 * to see how close a build is to the floor.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { DEFAULT_THRESHOLDS, loadThresholds, rgbToLab, deltaE00, parseColor } from './lib/picture-metrics.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5199';
const URL_3D = `${BASE}/fakieh/plant-3d?fx=on`;
/* Randomised, not a fixed 9355: two overlapping invocations of this very
   script (one left running past a Bash-tool timeout while a second was
   started) once raced to bind the same fixed port, and the SECOND script
   silently attached to the FIRST script's already-running, already-navigated
   Chrome instead of launching its own — which then explained a run of
   inexplicable camera-convergence and CDP-timeout failures perfectly: two
   independent scripts were clicking different zone buttons on the same page
   at the same time. A random port makes that class of collision astronomically
   unlikely instead of guaranteed the moment two copies overlap. */
const PORT = 9200 + Math.floor(Math.random() * 8000);
/* The client's real laptop, measured by driving the live page on it. Every
   threshold below is for THIS size; the roomier window flatters all of them. */
const WIDTH = 1280;
const HEIGHT = 495;
const DPR = 1.5;

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'client', 'src', 'lib', 'plant3d');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

/* THRESHOLDS, at the top, as required: defaults from `lib/picture-metrics.mjs`,
   overridable wholesale via PICTURE_THRESHOLDS_JSON (deep-merged). */
const { thresholds: THRESHOLDS, source: THRESHOLDS_SOURCE, raw: THRESHOLDS_RAW } = loadThresholds();

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
    this.ws = ws; this.id = 0; this.pending = new Map();
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
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`${method} timed out`)); }, 120_000);
    });
  }
}

async function evaluate(cdp, session, expression) {
  const r = await cdp.send('Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true }, session);
  if (r.exceptionDetails) {
    throw new Error(`page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  }
  return r.result.value;
}

/*
 * Bundles `silos.ts` + `siloData.ts` the way `verify-plant3d.mjs` does, so
 * this file can join `GET /api/silos` (siloNo, materialCode) against the
 * REAL silo -> zone mapping rather than re-deriving it and risking drift.
 * `siloData.ts` pulls in `react` and `@tanstack/react-query` as real runtime
 * imports, not just types — `verify-plant3d.mjs` already proves this bundles
 * and imports cleanly under Node as long as nothing calls the hook itself,
 * only the plain functions the module also exports (`materialLabel` here).
 */
async function bundleZoneLookup(dir) {
  await build({
    entryPoints: [join(SRC, 'silos.ts'), join(SRC, 'siloData.ts')],
    outdir: dir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
    external: [],
  });
  const silos = await import(pathToFileURL(join(dir, 'silos.js')).href);
  const data = await import(pathToFileURL(join(dir, 'siloData.js')).href);
  return { silos, data };
}

/* SILO_GROUPS' `zone: ZoneId` values, mapped to the exact view names VIEWS
   below already uses (`site.ts`'s ZONES carry the same labels). */
const ZONE_ID_TO_VIEW = {
  outside: 'Outside Yard',
  raw: 'Raw Material',
  dosing: 'Minerals & Micro',
  buffer: 'Press Buffer',
  finished: 'Finished Feed',
};

/**
 * `GET /api/silos` rows, joined against `SILO_BY_NO`, grouped by the ZONE VIEW
 * NAME each silo's group belongs to. Returns `Map<viewName, Set<materialName>>`
 * where `materialName` is exactly what `materialLabel()` would render for that
 * row — the same string the legend shows — so the join can be done by name
 * without needing a material code anywhere in the DOM.
 *
 * Errors are swallowed to `null` rather than thrown: if the dev API is briefly
 * unreachable this degrades check 4 to "could not determine which materials
 * are required per zone" (reported plainly, see the check itself) rather than
 * taking the whole run down with it — every other check here has nothing to
 * do with this join.
 */
async function zoneMaterialNames(silos, data) {
  const res = await fetch(`${BASE}/api/silos`);
  if (!res.ok) throw new Error(`GET /api/silos -> ${res.status}`);
  const rows = await res.json();
  const byView = new Map();
  for (const row of rows) {
    const code = String(row.materialCode ?? '').trim();
    if (!code) continue;
    const placement = silos.SILO_BY_NO.get(row.siloNo);
    if (!placement) continue;
    const viewName = ZONE_ID_TO_VIEW[placement.group.zone];
    if (!viewName) continue; // e.g. a zone this file draws no view for
    const name = data.materialLabel(row).trim();
    if (!byView.has(viewName)) byView.set(viewName, new Set());
    byView.get(viewName).add(name);
  }
  return byView;
}

/*
 * Waits for the camera to ARRIVE, rather than for a number of seconds.
 *
 * The camera eases by closing a fraction of the remaining gap on every
 * RENDERED frame, and headless SwiftShader here renders at roughly 0.5 fps. So
 * a real-time sleep, however generous, measures wherever the camera happened to
 * have got to — which on this machine is tens of metres from where fitToBounds
 * aimed it. That is not a small error: it is the difference between measuring
 * the framing the code computed and measuring a random point along the way to
 * it, and every reading this script took before today had it.
 *
 * The fix is not a longer sleep. Frames are the currency, so this pumps
 * advance() and watches the real camera position converge on the intended one
 * that CameraRig publishes. It returns the gap it reached, so a caller can tell
 * "arrived" from "gave up" instead of assuming.
 */
const CONVERGE = `
(async () => {
  const s = window.__plant3d;
  const f = window.__plant3dFraming;
  if (!s) return { ok: false, why: 'no renderer' };
  if (!f) return { ok: false, why: 'no __plant3dFraming — is this a DEV build?' };

  /*
   * Pumps frames until the camera ARRIVES at the framing the fit computed.
   *
   * Three earlier versions of this were wrong, and a direct probe settled it.
   * The probe sampled the published fit and the live camera together, 14 times:
   * the fit was IDENTICAL in every sample, [117.03, 41.15, 47.28], while the
   * camera walked from [92.86, 67.13, 101.01] to [116.93, 41.26, 47.5]. So the
   * fit is stable from the moment a zone is selected, and the only thing moving
   * is the camera easing toward it.
   *
   * That killed both previous approaches. Waiting for the fit to stop changing
   * exits after two frames, because it never changes — which is why one zone
   * always read as "still moving": it was simply the last one measured and had
   * had the fewest frames. And PLACING the camera on the fit does not stick,
   * because the rig recomputes position from its own animation state on every
   * frame and overwrites it.
   *
   * The ease closes a fraction of the gap per RENDERED frame, so frames are the
   * only currency that matters — real time is irrelevant, which is why every
   * sleep-based settle in this project has been unreliable. The probe needed
   * about 14. The yield between them lets React and the HUD's ResizeObserver
   * run, since those feed the insets the fit is built from.
   */
  let gap = Infinity;
  for (let i = 0; i < 150; i += 1) {
    s.advance(performance.now() + i * 16);
    await new Promise((r) => setTimeout(r, 30));
    const c = s.camera.position;
    const fr = window.__plant3dFraming;
    const t = fr.position;
    gap = Math.hypot(c.x - t[0], c.y - t[1], c.z - t[2]);
    /*
     * Relative to viewing distance, not an absolute metre count. The ease is
     * asymptotic — it closes a FRACTION of what remains each frame — so it
     * never lands exactly and an absolute bar is just a bet on how many frames
     * are affordable. A 0.25m bar failed at 0.48m after 150 frames; meanwhile
     * half a metre seen from a hundred is half a percent of the frame, which no
     * measurement here can resolve. What matters is that the camera is close
     * enough that the picture has stopped changing, and that scales with how
     * far away it is standing.
     */
    const viewDist = Math.hypot(t[0] - fr.target[0], t[1] - fr.target[1], t[2] - fr.target[2]);
    /*
     * The floor is 0.6, not 0.3, and the reason is the camera rig's own stop
     * rule: CameraRig (Plant3D.tsx) declares itself arrived and STOPS easing
     * once it is within 0.5 m of the fitted position. A convergence bar tighter
     * than that can never be met on a view where the rig halts at, say, 0.49 m
     * — which is exactly what the Raw Material zone did after the 2026-09-02
     * widening: every attempt reported a gap of 0.47-0.49 m and then timed
     * out, and it was blamed on machine contention. The harness must accept
     * whatever the rig accepts, with a little slack, or it measures nothing.
     */
    if (gap < Math.max(0.6, viewDist * 0.006)) {
      return { ok: true, frames: i + 1, gap, viewDist };
    }
  }
  return { ok: false, why: 'the camera never reached the computed framing', gap };
})()
`;

/*
 * Reads the material legend off the DOM: colour + name for every swatch shown.
 *
 * "Locate it by a `[data-legend]` attribute if present, else by the swatch
 * pattern" — the legend is being redesigned by another agent while this file
 * is being written, so binding to today's component structure (`LegendDock`
 * in `PlantHud.tsx`) would be the kind of check that breaks on a harmless
 * rename. Instead: prefer a `[data-legend]` container if one exists, then
 * look for small, roughly-square elements carrying an inline
 * `background-color` — the swatch pattern every version of this legend has
 * used — inside a `<button>`, and read the material's name off the DOM text
 * next to it (or the button's own `title`/text as a fallback).
 *
 * Colour is read via `getComputedStyle`, not the raw `style` attribute text:
 * that normalises hex/rgb/named colours to one `rgb(r, g, b)` form regardless
 * of which the component happens to write today.
 */
const LEGEND_SCRAPE = `
(() => {
  const scoped = document.querySelector('[data-legend]');
  const root = scoped || document;
  const candidates = [...root.querySelectorAll('[style*="background-color" i], [style*="backgroundColor" i]')];
  const out = [];
  const seen = new Set();
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.width > 28 || r.height < 4 || r.height > 28) continue;
    if (Math.abs(r.width - r.height) > 6) continue; /* roughly square: a swatch, not a bar */
    const btn = el.closest('button');
    if (!btn) continue;
    let name = null;
    const nameEl = el.nextElementSibling;
    if (nameEl && nameEl.textContent && nameEl.textContent.trim()) name = nameEl.textContent.trim();
    if (!name && btn.title) name = btn.title.split(' — ')[0].trim();
    if (!name && btn.textContent) name = btn.textContent.trim();
    if (!name) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const m = bg && bg.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)/i);
    if (!m) continue;
    const key = name + '|' + bg;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) });
  }
  return { scoped: Boolean(scoped), count: out.length, swatches: out };
})()
`;

/** Clicks a time-of-day header pill by its exact `title` ('Daylight' / 'Dusk' /
    'Night') and reads back `aria-pressed`, as instructed — the zone buttons
    below are matched more loosely (any of a few accepted labels) because
    their text has changed shape before; the look buttons are simple enough,
    and important enough to state precisely, to hold to an exact title. */
async function setLook(cdp, session, title) {
  const clicked = await evaluate(cdp, session, `
    (() => {
      const b = document.querySelector('button[title="${title}"]');
      if (b) b.click();
      return Boolean(b);
    })()
  `);
  if (!clicked) throw new Error(`no look control matched title "${title}"`);
  await sleep(300);
  const pressed = await evaluate(cdp, session,
    `document.querySelector('button[title="${title}"]')?.getAttribute('aria-pressed') ?? null`);
  if (pressed !== 'true') {
    throw new Error(`clicked the "${title}" look control but aria-pressed reads "${pressed}", not "true"`);
  }
}

const COLOR_MATH_SRC = `${rgbToLab.toString()}\n${deltaE00.toString()}`;

/*
 * Builds the MEASURE page script. A function rather than a constant because
 * two things vary per call: which materials to test for separability (only
 * populated for the Raw Material and Outside Yard views — everywhere else
 * this is an empty array, and the whole colour-math inner loop is skipped),
 * and the deltaE window a pixel must fall within to "belong" to a material,
 * which comes from THRESHOLDS and could be overridden by
 * PICTURE_THRESHOLDS_JSON.
 */
function buildMeasureScript(materials, deltaEWindow) {
  const bucketWidth = 0.5;
  const bucketCount = Math.max(4, Math.ceil(deltaEWindow / bucketWidth) + 2);
  return `
${COLOR_MATH_SRC}
(() => {
  const s = window.__plant3d;
  if (!s) return { error: 'no renderer on the page' };
  const gl = s.gl, scene = s.scene, camera = s.camera;
  const canvas = gl.domElement;
  const w = canvas.width, h = canvas.height;
  const buf = document.createElement('canvas');
  buf.width = w; buf.height = h;
  const ctx = buf.getContext('2d', { willReadFrequently: true });
  const read = () => { ctx.clearRect(0, 0, w, h); ctx.drawImage(canvas, 0, 0);
                       return ctx.getImageData(0, 0, w, h).data; };

  /*
   * Tone stats come from a COMPOSED frame — s.advance() drives the whole r3f
   * loop including the EffectComposer, so ACES tone mapping and the rest of the
   * post chain are in it. Calling gl.render() directly would bypass the
   * composer and measure a picture nobody sees.
   * The read has to happen in the same task as the draw: this context has no
   * preserveDrawingBuffer, so the buffer is gone by the next frame.
   */
  s.advance(performance.now());
  const composed = read();
  let lumSum = 0;
  const deciles = new Array(10).fill(0);
  let midWindow = 0; /* luminance in [0.25, 0.75], full composed frame */
  /* Raw power sums (S1..S4) of luminance, for skewness/kurtosis in one pass —
     central moments are then E[X^k] combinations, so no second pass over the
     frame is needed just to get the mean first. */
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  for (let p = 0; p < composed.length; p += 4) {
    const lum = (0.2126 * composed[p] + 0.7152 * composed[p+1] + 0.0722 * composed[p+2]) / 255;
    lumSum += lum;
    deciles[Math.min(9, Math.floor(lum * 10))] += 1;
    if (lum >= 0.25 && lum <= 0.75) midWindow += 1;
    const lum2 = lum * lum;
    s1 += lum; s2 += lum2; s3 += lum2 * lum; s4 += lum2 * lum2;
  }
  const frameTotal = composed.length / 4;
  const meanLum = s1 / frameTotal;
  const e2 = s2 / frameTotal, e3 = s3 / frameTotal, e4 = s4 / frameTotal;
  const m2 = e2 - meanLum * meanLum;
  const m3 = e3 - 3 * meanLum * e2 + 2 * meanLum * meanLum * meanLum;
  const m4 = e4 - 4 * meanLum * e3 + 6 * meanLum * meanLum * e2 - 3 * meanLum ** 4;
  /*
   * Sarle's bimodality coefficient: (skewness^2 + 1) / kurtosis, using
   * ORDINARY (not excess) kurtosis, so a normal distribution scores ~1/3 and
   * a uniform one ~0.56 — the reference points the 0.66 fail-floor is judged
   * against. m2 at or near 0 means a flat, single-value frame (degenerate,
   * not bimodal), which is reported as null rather than a divide-by-zero.
   */
  const skewness = m2 > 1e-9 ? m3 / Math.pow(m2, 1.5) : null;
  const kurtosis = m2 > 1e-9 ? m4 / (m2 * m2) : null;
  const bimodality = (skewness !== null && kurtosis !== null && kurtosis > 1e-9)
    ? (skewness * skewness + 1) / kurtosis
    : null;

  /*
   * Coverage by MASK: hide everything that is not a silo, clear to black, and
   * count what is left. Any lit pixel is a silo, by construction, at any
   * contrast — no colour classification to go stale.
   *
   * TWO WRONG VERSIONS PRECEDED THIS, and both are worth recording because
   * they failed the same way: they produced a confident number that was not
   * measuring what it said.
   *
   * The first diffed two frames, normal and silos-hidden, and called the
   * changed pixels the silos. It reported a large, plainly visible bank of 48
   * bins as 3.85% of the frame. I explained that as dark bins against a dark
   * wall falling under the difference threshold. That explanation was wrong.
   *
   * The real cause, which the second version exposed by reporting 99% coverage
   * and a box the size of the whole canvas: the EffectComposer leaves a render
   * target bound, so gl.render(scene, camera) draws into ITS buffer, not the
   * canvas. Both reads were therefore of the last COMPOSED frame — the full
   * scene — in both versions. The diff was between two identical images, and
   * the mask was never a mask.
   *
   * Hence the explicit setRenderTarget(null). The lesson is the one this
   * project keeps relearning: a measurement that cannot fail visibly will
   * produce a plausible number and it will get quoted. Comparing the number
   * against the actual screenshot is the only reason either was caught.
   */
  /*
   * Tagged meshes win when the tag exists: userData.silo === true, or a name
   * starting 'silo:' is what the geometry workstream is adding specifically
   * so a mask like this one does not have to guess. Structures, fence posts,
   * trusses and the beacon atlas are all instanced too, and none of them are
   * silos — masking "any InstancedMesh with instances" would pull them in the
   * moment they exist. Until the tag lands, fall back to that old rule, but
   * SAY SO: which rule ran and how many meshes it caught, every time.
   */
  const tagged = [];
  scene.traverse((o) => {
    if (o.userData && o.userData.silo === true) { tagged.push(o); return; }
    if (typeof o.name === 'string' && o.name.startsWith('silo:')) tagged.push(o);
  });
  let silos;
  let maskRule;
  if (tagged.length) {
    silos = tagged;
    maskRule = 'tagged (userData.silo === true, or name starting "silo:")';
  } else {
    const fallback = [];
    scene.traverse((o) => { if (o.isInstancedMesh && o.count > 0) fallback.push(o); });
    silos = fallback;
    maskRule = 'fallback (any InstancedMesh with instances — no silo tag found in the scene)';
  }
  if (!silos.length) {
    return { error: 'no silo meshes found under either rule (tagged: ' + tagged.length + ', fallback would also be 0)' };
  }
  const siloSet = new Set(silos);

  const hidden = [];
  scene.traverse((o) => {
    if (o === scene) return;
    if (siloSet.has(o)) return;
    /* Only leaves are hidden: hiding a group would take its silo children with
       it, and the silo passes live under group transforms. */
    if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.visible) {
      hidden.push(o); o.visible = false;
    }
  });
  const bg = scene.background; scene.background = null;
  const fog = scene.fog; scene.fog = null;
  /* three.js Color is not a global here, so it is borrowed off a material
     that already has one, rather than assumed to be importable in the page. */
  const ColorCtor = silos[0].material.color.constructor;
  const prevClear = gl.getClearColor(new ColorCtor());
  const prevAlpha = gl.getClearAlpha();
  gl.setClearColor(0x000000, 1);
  /*
   * Three things, and all three were needed; each was found by the mask coming
   * back wrong in a different way.
   *
   * setRenderTarget(null) — the composer leaves its own target bound, so a
   * direct render goes to that buffer and the canvas keeps the last composed
   * frame. Symptom: the mask was a perfect copy of the full scene.
   *
   * autoClear — the composer sets it false, so even once aimed at the canvas
   * the mask render painted ON TOP of the frame already there instead of
   * replacing it. Symptom: 99% coverage and a box the size of the canvas,
   * which is what a full scene with a few silos drawn over it measures as.
   *
   * An explicit clear, because relying on autoClear alone leaves the result
   * depending on renderer state this code does not own.
   */
  const prevAutoClear = gl.autoClear;
  gl.autoClear = true;
  gl.setRenderTarget(null);
  gl.clear(true, true, true);
  gl.render(scene, camera);
  const mask = read();
  gl.autoClear = prevAutoClear;
  scene.background = bg; scene.fog = fog;
  gl.setClearColor(prevClear, prevAlpha);
  hidden.forEach((o) => { o.visible = true; });
  s.advance(performance.now());

  /*
   * One combined pass over both buffers, aligned by pixel index: MASK says
   * WHICH pixels are silo, by construction (see above); the colour sampled
   * for each of those pixels comes from COMPOSED, because that is the picture
   * a viewer actually sees — ACES tone mapping and the rest of the post chain
   * included. The mask render itself bypasses the composer entirely (it has
   * to, to be a clean mask — see setRenderTarget(null) above), so its OWN
   * pixel colours are pre-tonemap and would misrepresent "the picture" for a
   * tonal or colour-separability measurement, even though they are exactly
   * right for deciding WHERE the silos are. Two different jobs, one pass.
   */
  const materials = ${JSON.stringify(materials)};
  const deltaEWindow = ${deltaEWindow};
  const siloLumBuckets = new Float64Array(101);
  let siloLumCount = 0;

  /*
   * Per material: the MATCHED pixel set is unchanged (mask pixels within
   * deltaEWindow of that material's swatch), but what is kept about it is
   * not a hit count — it is enough to recover the MEDIAN rendered Lab colour
   * of that set, so the separability check below can compare "how far apart
   * do these materials actually render" rather than "how many pixels each
   * happened to hit". Marginal (per-channel) median via a bucketed histogram
   * per channel — L in [0,100], a/b in [-128,127] — rather than sorting a
   * potentially large pixel array, and rather than a true multivariate
   * median, which is not worth the cost for a diagnostic number.
   */
  const L_BUCKETS = 101;
  const C_BUCKETS = 256; /* a/b offset by +128 */
  const matStats = materials.map(() => ({
    within: 0,
    Lb: new Float64Array(L_BUCKETS),
    Ab: new Float64Array(C_BUCKETS),
    Bb: new Float64Array(C_BUCKETS),
  }));

  let n = 0, minX = w, maxX = -1, minY = h, maxY = -1;
  for (let p = 0; p < mask.length; p += 4) {
    if (mask[p] + mask[p+1] + mask[p+2] <= 6) continue;
    n += 1;
    const i = p / 4, x = i % w, y = (i / w) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;

    const r = composed[p], g = composed[p+1], b = composed[p+2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    siloLumBuckets[Math.min(100, Math.max(0, Math.round(lum * 100)))] += 1;
    siloLumCount += 1;

    if (materials.length) {
      const lab = rgbToLab(r, g, b);
      for (let mi = 0; mi < materials.length; mi += 1) {
        const de = deltaE00(lab, materials[mi].lab);
        if (de <= deltaEWindow) {
          const st = matStats[mi];
          st.within += 1;
          st.Lb[Math.min(L_BUCKETS - 1, Math.max(0, Math.round(lab[0])))] += 1;
          st.Ab[Math.min(C_BUCKETS - 1, Math.max(0, Math.round(lab[1] + 128)))] += 1;
          st.Bb[Math.min(C_BUCKETS - 1, Math.max(0, Math.round(lab[2] + 128)))] += 1;
        }
      }
    }
  }

  const percentileIndex = (buckets, total, p) => {
    if (total === 0) return null;
    const target = p * total;
    let cum = 0;
    for (let i = 0; i < buckets.length; i += 1) {
      cum += buckets[i];
      if (cum >= target) return i;
    }
    return buckets.length - 1;
  };
  const medianFromBuckets = (buckets, total, offset) => {
    if (!total) return null;
    const idx = percentileIndex(buckets, total, 0.5);
    return idx === null ? null : idx - offset;
  };
  const siloLum = {
    count: siloLumCount,
    p10: siloLumCount ? percentileIndex(siloLumBuckets, siloLumCount, 0.10) / 100 : null,
    p50: siloLumCount ? percentileIndex(siloLumBuckets, siloLumCount, 0.50) / 100 : null,
    p90: siloLumCount ? percentileIndex(siloLumBuckets, siloLumCount, 0.90) / 100 : null,
  };

  const materialResults = materials.map((mat, mi) => {
    const st = matStats[mi];
    if (!st.within) return { name: mat.name, count: 0, renderedMedianLab: null, deltaEToOwnSwatch: null };
    const renderedMedianLab = [
      medianFromBuckets(st.Lb, st.within, 0),
      medianFromBuckets(st.Ab, st.within, 128),
      medianFromBuckets(st.Bb, st.within, 128),
    ];
    return {
      name: mat.name,
      count: st.within,
      renderedMedianLab,
      deltaEToOwnSwatch: deltaE00(renderedMedianLab, mat.lab),
    };
  });

  const total = mask.length / 4;
  const decile3to7Share = (deciles[2] + deciles[3] + deciles[4] + deciles[5] + deciles[6]) / frameTotal;
  return {
    stage: [w, h],
    maskRule,
    taggedMeshCount: tagged.length,
    instancedMeshes: silos.length,
    instances: silos.reduce((a, o) => a + o.count, 0),
    siloPixels: n,
    coverage: n / total,
    box: maxX < 0 ? null : { w: maxX - minX + 1, h: maxY - minY + 1, minX, minY },
    meanLuminance: lumSum / total,
    midtones: (deciles[3] + deciles[4] + deciles[5] + deciles[6]) / total,
    midtoneShare: midWindow / total,
    deciles: deciles.map((c) => c / total),
    decile3to7Share,
    skewness, kurtosis, bimodality,
    siloLum,
    materials: materialResults,
    draws: gl.info.render.calls,
    tris: gl.info.render.triangles,
  };
})()
`;
}

function fmtPct(x) { return x === null || x === undefined ? 'n/a' : `${(x * 100).toFixed(1)}%`; }
function fmtDe(x) { return x === null || x === undefined ? 'n/a' : x.toFixed(1); }

async function main() {
  console.log(`thresholds: ${THRESHOLDS_SOURCE}` + (THRESHOLDS_RAW ? ` = ${THRESHOLDS_RAW}` : ''));
  console.log(`      midtone day: whole-site >= ${fmtPct(THRESHOLDS.midtone.day.wholeSite)}, `
    + `zone >= ${fmtPct(THRESHOLDS.midtone.day.zone)}; dusk whole-site >= ${fmtPct(THRESHOLDS.midtone.dusk.wholeSite)}`);
  console.log(`      histogram day: max decile share <= ${fmtPct(THRESHOLDS.histogram.day.maxDecileShare)}`);
  console.log(`      silo tonal range: p90-p10 >= ${fmtPct(THRESHOLDS.siloTonalRange.minP10P90Spread)}`);
  console.log(`      material separability: deltaE <= ${THRESHOLDS.materialSeparability.deltaEWindow}, `
    + `>= ${THRESHOLDS.materialSeparability.minPixels} px`
    + (Object.keys(THRESHOLDS.materialSeparability.swatchOverride).length
      ? `, swatch override on: ${Object.keys(THRESHOLDS.materialSeparability.swatchOverride).join(', ')}`
      : ''));

  const chrome = CHROMES.find((p) => existsSync(p));
  if (!chrome) { console.error('COULD NOT RUN — no Chrome or Edge found'); process.exit(2); }
  const profile = join(tmpdir(), `plant3d-picture-${process.pid}`);
  const bundleDir = await mkdtemp(join(tmpdir(), 'plant3d-picture-zones-'));

  const child = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    `--window-size=${WIDTH},${HEIGHT}`, '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  try {
    /* The zone -> required-material join. Not fatal on its own failure: the
       rest of this file has nothing to do with it, so a failure here degrades
       check 4 to "could not determine which materials are required" (reported
       plainly by the check itself) instead of aborting every other check. */
    let byViewMaterials = null;
    let zoneLookupError = null;
    try {
      const { silos, data } = await bundleZoneLookup(bundleDir);
      byViewMaterials = await zoneMaterialNames(silos, data);
    } catch (err) {
      zoneLookupError = err && err.message ? err.message : String(err);
    }

    let wsUrl = null;
    for (let i = 0; i < 60 && !wsUrl; i += 1) {
      await sleep(250);
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
      catch { /* not up yet */ }
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
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: false }, session);

    /* If the page is mid-reload from another agent (blank canvas or
       window.__plant3d missing after 60s), retry up to 3 times with a 20s
       wait, per instruction — the dev server here is shared with four other
       agents editing `client/` live underneath this measurement. */
    let ready = false;
    let lastReadyError = null;
    for (let attempt = 1; attempt <= 3 && !ready; attempt += 1) {
      await cdp.send('Page.navigate', { url: URL_3D }, session);
      for (let i = 0; i < 120 && !ready; i += 1) {
        await sleep(500);
        ready = await evaluate(cdp, session, 'Boolean(window.__plant3d)').catch((err) => {
          lastReadyError = err;
          return false;
        });
      }
      if (!ready && attempt < 3) {
        console.error(`the page did not create a renderer within 60s (attempt ${attempt}/3) — `
          + 'retrying in 20s in case another agent is mid-reload');
        await sleep(20_000);
      }
    }
    if (!ready) {
      throw new Error('the 3D view never created a renderer after 3 attempts'
        + (lastReadyError ? ` (last error: ${lastReadyError.message ?? lastReadyError})` : ''));
    }
    await sleep(3000);

    /* Legend swatches, read once — `materialsPresent` (siloData.ts) builds the
       legend from ALL rows the plant reports, not filtered by the zone tab
       currently selected, so this does not need to be re-read per zone. */
    const legend = await evaluate(cdp, session, LEGEND_SCRAPE);
    const swatchOverride = THRESHOLDS.materialSeparability.swatchOverride || {};
    const legendSwatches = (legend?.swatches ?? []).map((sw) => {
      let [r, g, b] = [sw.r, sw.g, sw.b];
      if (Object.prototype.hasOwnProperty.call(swatchOverride, sw.name)) {
        const parsed = parseColor(swatchOverride[sw.name]);
        if (parsed) [r, g, b] = parsed;
      }
      return { name: sw.name, r, g, b, lab: rgbToLab(r, g, b) };
    });
    console.log(`      legend: ${legend?.count ?? 0} swatches found `
      + `(${legend?.scoped ? 'via [data-legend]' : 'via swatch pattern'})`);
    if (zoneLookupError) {
      console.log(`      zone/material join: COULD NOT DETERMINE — ${zoneLookupError}`);
    } else {
      for (const [view, names] of byViewMaterials) {
        console.log(`      ${view.padEnd(14)} requires: ${[...names].join(', ') || '(none reported)'}`);
      }
    }

    /* Explicit and verified — the instruction is to read back aria-pressed
       before measuring, not to assume the click landed. */
    await setLook(cdp, session, 'Daylight');

    /* Zone labels carry a long and a short form depending on width; both are
       accepted, for the same reason the screenshot harness accepts both. */
    /*
     * Floors, not targets, and each is roughly a quarter below what the build
     * measured when this was written:
     *
     *   whole site     coverage 13.72%  band 325px
     *   Raw Material   coverage  6.32%  band 226px
     *   Outside Yard   coverage  7.57%  band 338px
     *   Finished Feed  coverage 18.16%  band 294px
     *
     * Per-view rather than one number, because the zones genuinely differ: 48
     * finished-feed bins packed in a store fill far more of a frame than 22
     * raw bins strung along a wall, and forcing them to one threshold would
     * either excuse the weak view or condemn the strong one.
     *
     * The quarter of slack is deliberate. These are rendered measurements on a
     * software rasteriser and they will wobble by a percent or so between runs;
     * a floor set at the measured value would fail on noise, and a check that
     * cries wolf gets switched off, which is the worst outcome available.
     *
     * Raising these when the picture improves is the intended maintenance.
     * Lowering one to make a run go green is the thing not to do — that is
     * precisely how a check stops being able to fail.
     */
    const VIEWS = [
      { name: 'whole site', accept: ['Whole site', 'All'], minCoverage: 0.10, minBox: 240 },
      { name: 'Raw Material', accept: ['Raw Material', 'Raw'], minCoverage: 0.045, minBox: 170 },
      { name: 'Outside Yard', accept: ['Outside Yard', 'Yard'], minCoverage: 0.055, minBox: 250 },
      { name: 'Finished Feed', accept: ['Finished Feed', 'Finished'], minCoverage: 0.13, minBox: 220 },
      /*
       * Dosing and Press Buffer were missing, and an audit caught it at the
       * worst possible moment: the 400 series had just been repositioned into
       * the dosing group, and the only view that shows it was the one view
       * this lane never measured. A picture check that skips a third of the
       * views is silent about exactly the change most likely to need it.
       * Floors are set a quarter below first measurement, like the others.
       */
      { name: 'Minerals & Micro', accept: ['Minerals', 'Dosing'], minCoverage: 0.03, minBox: 100 },
      { name: 'Press Buffer', accept: ['Press Buffer', 'Buffer'], minCoverage: 0.02, minBox: 90 },
    ];

    /*
     * `PICTURE_VIEWS` (comma-separated, case-insensitive substring match
     * against a view's name) restricts which views this run measures, and
     * `PICTURE_SKIP_DUSK=1` drops the dusk pass entirely. Neither changes what
     * any check MEANS or its floors — only how much of the site a given run
     * bothers to look at. For the full picture (and the numbers this file's
     * exit code should be trusted for) leave both unset. They exist because a
     * full run is six views x two looks against a SwiftShader software
     * rasteriser on a machine that may be running several other agents' own
     * headless Chromes at once, and a targeted proof (e.g. "does check 4 fail
     * when the swatch is bogus") only needs the one or two views that check
     * actually touches.
     */
    const viewFilter = (process.env.PICTURE_VIEWS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const ACTIVE_VIEWS = viewFilter.length
      ? VIEWS.filter((v) => viewFilter.some((f) => v.name.toLowerCase().includes(f)))
      : VIEWS;
    if (viewFilter.length && !ACTIVE_VIEWS.length) {
      throw new Error(`PICTURE_VIEWS="${process.env.PICTURE_VIEWS}" matched no view name (have: ${VIEWS.map((v) => v.name).join(', ')})`);
    }
    if (viewFilter.length) {
      console.log(`      PICTURE_VIEWS restricts this run to: ${ACTIVE_VIEWS.map((v) => v.name).join(', ')}`);
    }
    const SKIP_DUSK = process.env.PICTURE_SKIP_DUSK === '1';

    /* Views whose current material mix `verify-picture` can actually check
       against the live feed — see the module header for why (only these two
       zones both have a floor here AND report live material codes). */
    const MATERIAL_VIEWS = new Set(['Raw Material', 'Outside Yard']);

    async function measureView(view, { materials }) {
      const hit = await evaluate(cdp, session, `
        (() => {
          const names = ${JSON.stringify(view.accept)};
          const b = [...document.querySelectorAll('button')]
            .find((x) => names.some((n) => x.textContent.trim().startsWith(n)));
          if (b) b.click();
          return Boolean(b);
        })()
      `);
      if (!hit) throw new Error(`no zone control matched ${view.accept.join(' / ')}`);
      await sleep(400);
      const arrival = await evaluate(cdp, session, CONVERGE);
      if (!arrival.ok) {
        throw new Error(
          `${view.name}: ${arrival.why}`
          + (arrival.gap !== undefined ? ` (still ${arrival.gap.toFixed(2)}m short)` : ''),
        );
      }

      const measureScript = buildMeasureScript(materials, THRESHOLDS.materialSeparability.deltaEWindow);

      /*
       * Measured twice, and a disagreement is a REFUSAL rather than a verdict.
       *
       * The camera eases into a zone over about a second, and this machine runs
       * several headless Chromes at once when agents are working, so a single
       * reading taken too early catches the camera mid-flight. Two readings of
       * the same view came back 3.93% and 5.09% — a 30% spread on a number
       * being compared against a 4.5% floor. Either could have been reported as
       * fact.
       *
       * So: settle, read, settle, read again. If the two agree the picture has
       * stopped moving and the number means something. If they do not, this
       * script does not know what the frame looks like, and says so with exit
       * 2 — the same distinction the model lane draws between "found nothing
       * wrong" and "could not look". Averaging them would produce a confident
       * number out of two readings that disagree, which is the failure this
       * whole file exists to stop.
       */
      const first = await evaluate(cdp, session, measureScript);
      if (first.error) throw new Error(`${view.name}: ${first.error}`);
      /* Still measured twice, but now as a check on the MEASUREMENT rather than
         a wait for the camera — the camera is already proven to have arrived. */
      await evaluate(cdp, session, CONVERGE);
      const m = await evaluate(cdp, session, measureScript);
      if (m.error) throw new Error(`${view.name}: ${m.error}`);
      const drift = Math.abs(m.coverage - first.coverage) / Math.max(m.coverage, 1e-6);
      if (drift > 0.06) {
        /*
         * Name the likely cause rather than leaving a mystery. If the drawing
         * buffer changed size between the two reads then the picture did not
         * move — the CANVAS did, which on this page means AdaptiveDpr responded
         * to load and resized it, and a resize re-measures the HUD insets and
         * re-runs the camera fit. The heaviest zone trips that first, and a
         * bare "still moving" would have sent someone looking at the camera.
         */
        const resized = first.stage[0] !== m.stage[0] || first.stage[1] !== m.stage[1];
        throw new Error(
          `${view.name}: the frame is still moving — coverage read `
          + `${(first.coverage * 100).toFixed(2)}% then ${(m.coverage * 100).toFixed(2)}% `
          + `(${(drift * 100).toFixed(0)}% apart). Refusing to report either as the picture.`
          + (resized
            ? ` The drawing buffer resized between reads (${first.stage.join('x')} -> ${m.stage.join('x')}), `
              + 'so this is the renderer changing resolution under load, not the camera.'
            : ` Drawing buffer was stable at ${m.stage.join('x')}, so the canvas is not the cause.`),
        );
      }
      return m;
    }

    /*
     * `measureView` throws plainly-worded errors for a page that has gone out
     * from under it (no renderer, no framing, no zone control found), which is
     * exactly the shape of another agent's Vite HMR reload landing mid-run —
     * this dev server is shared with four other agents editing `client/` live.
     * Per instruction: retry up to 3 times with a 20s wait before giving up.
     */
    async function ensureRendererBack(maxWaitMs) {
      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        const ok = await evaluate(cdp, session, 'Boolean(window.__plant3d)').catch(() => false);
        if (ok) return true;
        await sleep(500);
      }
      return false;
    }
    async function measureViewResilient(view, opts) {
      let lastErr;
      let attempts = 0;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        attempts = attempt;
        try {
          return await measureView(view, opts);
        } catch (err) {
          lastErr = err;
          if (attempt === 3) break;
          const msg = err && err.message ? err.message : String(err);
          /* A page reload from another agent editing client/ live shows up as
             one of these — worth the full 20s wait for the renderer to come
             back before trying again. Anything else (most often the camera
             convergence gap missing its bar by a hair under load from several
             headless Chromes running at once — this machine's own comment on
             CONVERGE notes exactly that kind of near-miss) is retried right
             away: a fresh click + converge is cheap and the flakiness is
             usually gone on the next attempt. */
          const looksLikeReload = /no renderer|__plant3dFraming|no zone control matched|no instanced silo|no silo meshes found/.test(msg);
          console.error(`      ${view.name}: ${msg}`);
          if (looksLikeReload) {
            console.error(`      ${view.name}: looks like another agent's page reload — waiting 20s and `
              + `retrying (attempt ${attempt + 1}/3)`);
            await sleep(20_000);
            const back = await ensureRendererBack(60_000);
            console.error(`      ${view.name}: renderer ${back ? 'is back' : 'still not back after 60s'} — retrying anyway`);
          } else {
            console.error(`      ${view.name}: retrying (attempt ${attempt + 1}/3)`);
            await sleep(1_000);
          }
        }
      }
      lastErr.message = `${lastErr.message} [gave up after ${attempts} attempt(s)]`;
      throw lastErr;
    }

    /* ---- daylight: every view -------------------------------------- */
    const results = [];
    const viewsSkipped = [];
    for (const view of ACTIVE_VIEWS) {
      const materials = MATERIAL_VIEWS.has(view.name) ? legendSwatches : [];
      let m;
      try {
        m = await measureViewResilient(view, { materials });
      } catch (err) {
        console.error(`      ${view.name}: giving up — ${err && err.message ? err.message : err}`);
        viewsSkipped.push(view.name);
        continue;
      }
      results.push({ view, m });
      console.log(
        `      ${view.name.padEnd(14)} coverage ${(m.coverage * 100).toFixed(2)}% `
        + `box ${m.box ? `${m.box.w}x${m.box.h}` : 'none'} `
        + `instances ${m.instances} mean ${(m.meanLuminance * 100).toFixed(0)}% `
        + `mid(0.3-0.7) ${(m.midtones * 100).toFixed(0)}% `
        + `mid(0.25-0.75) ${fmtPct(m.midtoneShare)} `
        + `siloLum p10/50/90 ${fmtPct(m.siloLum.p10)}/${fmtPct(m.siloLum.p50)}/${fmtPct(m.siloLum.p90)}`,
      );
      console.log(`        mask: ${m.maskRule} (${m.taggedMeshCount} tagged, ${m.instancedMeshes} masked)`);
      console.log(`        deciles: ${m.deciles.map((d, i) => `[${i}]${(d * 100).toFixed(1)}%`).join(' ')}`);
      console.log(`        decile[3-7 1-based, 0.2-0.7] ${fmtPct(m.decile3to7Share)}  `
        + `skew ${m.skewness === null ? 'n/a' : m.skewness.toFixed(3)}  `
        + `kurtosis ${m.kurtosis === null ? 'n/a' : m.kurtosis.toFixed(3)}  `
        + `bimodality (Sarle) ${m.bimodality === null ? 'n/a' : m.bimodality.toFixed(3)}`);
      if (materials.length) {
        for (const mat of m.materials) {
          console.log(`        material ${mat.name.padEnd(20)} matched px (ΔE<=${THRESHOLDS.materialSeparability.deltaEWindow}): `
            + `${mat.count}  rendered median Lab ${mat.renderedMedianLab ? mat.renderedMedianLab.map((v) => v.toFixed(1)).join(',') : 'n/a'}  `
            + `ΔE to own swatch ${fmtDe(mat.deltaEToOwnSwatch)}`);
        }
      }
    }
    if (viewsSkipped.length) {
      console.log(`\n      COULD NOT MEASURE (day): ${viewsSkipped.join(', ')} — retries exhausted, see log above`);
    }

    /* ---- dusk: whole site only --------------------------------------
       DESIGN.md and THRESHOLDS.midtone.dusk both scope the dusk floor to
       whole-site — there is no stated per-zone dusk floor to check, and
       measuring all six views twice per look would roughly double runtime
       for numbers nothing enforces. */
    const duskWholeSiteView = VIEWS[0];
    let duskWholeSite = null;
    if (SKIP_DUSK) {
      console.log('      PICTURE_SKIP_DUSK=1 — dusk pass skipped; dusk checks below report "could not be measured"');
    } else {
      await setLook(cdp, session, 'Dusk');
      try {
        const duskM = await measureViewResilient(duskWholeSiteView, { materials: [] });
        duskWholeSite = { view: duskWholeSiteView, m: duskM };
        console.log(
          `      [dusk] ${duskWholeSiteView.name.padEnd(14)} coverage ${(duskM.coverage * 100).toFixed(2)}% `
          + `mid(0.25-0.75) ${fmtPct(duskM.midtoneShare)} siloLum p10/50/90 `
          + `${fmtPct(duskM.siloLum.p10)}/${fmtPct(duskM.siloLum.p50)}/${fmtPct(duskM.siloLum.p90)} `
          + `decile[3-7] ${fmtPct(duskM.decile3to7Share)}`,
        );
      } catch (err) {
        console.error(`      [dusk] whole site: giving up — ${err && err.message ? err.message : err}`);
      }
    }

    /*
     * The check this whole file exists for. An audit pointed out that a green
     * model run is compatible with a `SiloGroupMesh` that renders nothing, and
     * that is not a hypothetical: the shader once compiled cleanly and drew
     * every bin BLACK while every other lane passed.
     */
    check('the silos actually render', (() => {
      const dead = results.filter((r) => r.m.siloPixels === 0);
      if (dead.length) return `${dead.map((r) => r.view.name).join(', ')} drew no silo pixels at all`;
      const noInstances = results.filter((r) => r.m.instances === 0);
      return noInstances.length ? `${noInstances.map((r) => r.view.name).join(', ')} has no instances` : null;
    })());

    check('the silos take up a readable share of the frame', (() => {
      const thin = results.filter((r) => r.m.coverage < r.view.minCoverage);
      return thin.length
        ? thin.map((r) => `${r.view.name}: ${(r.m.coverage * 100).toFixed(2)}% of the frame, floor is ${(r.view.minCoverage * 100).toFixed(0)}%`).join('; ')
        : null;
    })());

    check('a zone view puts the bins at a legible size', (() => {
      const small = results.filter((r) => !r.m.box || r.m.box.h < r.view.minBox);
      return small.length
        ? small.map((r) => `${r.view.name}: silo band is ${r.m.box ? r.m.box.h : 0}px tall, floor is ${r.view.minBox}px`).join('; ')
        : null;
    })());

    /* A skipped view is an evidence gap, not a silent pass — every check below
       only sees the views actually in `results`, so this says plainly which
       ones that excludes rather than letting fewer checks quietly mean the
       same thing as a clean run. */
    check('every planned view was actually measured (day)', () => (
      viewsSkipped.length
        ? `could not measure: ${viewsSkipped.join(', ')} — retries exhausted (see the retry log above); `
          + `every check below ran only over the ${results.length} view(s) that were measured`
        : null
    ));

    /* ---- check 1: mid-tone share, per look and view ------------------- */
    check('mid-tone share (day) stays above its floor', (() => {
      if (!results.length) return 'no day views were measured at all';
      const bad = [];
      for (const { view, m } of results) {
        const floor = view.name === 'whole site' ? THRESHOLDS.midtone.day.wholeSite : THRESHOLDS.midtone.day.zone;
        if (m.midtoneShare < floor) {
          bad.push(`${view.name}: ${fmtPct(m.midtoneShare)}, floor ${fmtPct(floor)}`);
        }
      }
      return bad.length ? bad.join('; ') : null;
    })());

    check('mid-tone share (dusk, whole site) stays above its floor', (() => {
      if (!duskWholeSite) return 'dusk whole-site view could not be measured — see the retry log above';
      const floor = THRESHOLDS.midtone.dusk.wholeSite;
      return duskWholeSite.m.midtoneShare < floor
        ? `whole site: ${fmtPct(duskWholeSite.m.midtoneShare)}, floor ${fmtPct(floor)}`
        : null;
    })());

    /* ---- check 2: histogram shape, three measures, day ----------------
       A Codex audit of an earlier draft caught that "no single decile > 30%"
       alone passes a picture with two separated ~25% peaks either side of a
       dark trough — textbook bimodal, and invisible to a per-bucket cap. So
       three independent measures, each able to fail on its own. */
    check('luminance histogram: no single decile exceeds its cap (day)', (() => {
      const bad = [];
      for (const { view, m } of results) {
        const worst = m.deciles.reduce((best, d, i) => (d > best.share ? { share: d, i } : best), { share: -1, i: -1 });
        if (worst.share > THRESHOLDS.histogram.day.maxDecileShare) {
          bad.push(`${view.name}: decile [${worst.i}] holds ${fmtPct(worst.share)}, floor ${fmtPct(THRESHOLDS.histogram.day.maxDecileShare)}`);
        }
      }
      return bad.length ? bad.join('; ') : null;
    })());

    check('luminance histogram: mid-band (deciles 3-7, 0.2-0.7) holds its share (day)', (() => {
      const bad = [];
      for (const { view, m } of results) {
        if (m.decile3to7Share < THRESHOLDS.histogram.day.minMidShare3to7) {
          bad.push(`${view.name}: ${fmtPct(m.decile3to7Share)}, floor ${fmtPct(THRESHOLDS.histogram.day.minMidShare3to7)}`);
        }
      }
      return bad.length ? bad.join('; ') : null;
    })());

    check('luminance histogram: mid-band (deciles 3-7) holds its share (dusk, whole site)', (() => {
      if (!duskWholeSite) return 'dusk whole-site view could not be measured — see the retry log above';
      const floor = THRESHOLDS.histogram.dusk.minMidShare3to7;
      return duskWholeSite.m.decile3to7Share < floor
        ? `whole site: ${fmtPct(duskWholeSite.m.decile3to7Share)}, floor ${fmtPct(floor)}`
        : null;
    })());

    check("Sarle's bimodality coefficient stays below its ceiling (day)", (() => {
      const bad = [];
      for (const { view, m } of results) {
        if (m.bimodality === null) { bad.push(`${view.name}: could not be computed (degenerate frame)`); continue; }
        if (m.bimodality > THRESHOLDS.histogram.day.maxBimodality) {
          bad.push(`${view.name}: ${m.bimodality.toFixed(3)}, ceiling ${THRESHOLDS.histogram.day.maxBimodality}`);
        }
      }
      return bad.length ? bad.join('; ') : null;
    })());

    /* ---- check 3: silo tonal range, day, per view ------------------ */
    check('silo tonal range (day) carries contrast, per view', (() => {
      const bad = [];
      for (const { view, m } of results) {
        if (m.siloLum.p10 === null) { bad.push(`${view.name}: no silo pixels to measure`); continue; }
        const spread = m.siloLum.p90 - m.siloLum.p10;
        console.log(`        ${view.name.padEnd(14)} p10 ${fmtPct(m.siloLum.p10)} p50 ${fmtPct(m.siloLum.p50)} `
          + `p90 ${fmtPct(m.siloLum.p90)} spread ${fmtPct(spread)}`);
        if (spread < THRESHOLDS.siloTonalRange.minP10P90Spread) {
          bad.push(`${view.name}: p90-p10 ${fmtPct(spread)}, floor ${fmtPct(THRESHOLDS.siloTonalRange.minP10P90Spread)}`);
        }
      }
      return bad.length ? bad.join('; ') : null;
    })());

    /*
     * ---- check 4: material separability, Raw + Outside Yard, day -------
     *
     * Redefined from a per-pixel colour-hit count (which cannot tell "two
     * materials both render close to their own swatch but indistinguishable
     * from EACH OTHER" from genuine separation) to a comparison of RENDERED
     * MEDIAN colours: each visible material's median must land within
     * `deltaEWindow` of its own swatch, AND the smallest pairwise ΔE00
     * between the rendered medians must be at least `minPairwiseRatio` of the
     * smallest pairwise ΔE00 between the corresponding target swatches — see
     * the module header for the full argument.
     */
    for (const viewName of MATERIAL_VIEWS) {
      check(`material separability — ${viewName} (day)`, (() => {
        const entry = results.find((r) => r.view.name === viewName);
        if (!entry) return `${viewName}: was not measured`;
        if (!legendSwatches.length) return `no legend swatches were found in the DOM — see the "legend:" line above`;
        if (zoneLookupError) return `could not determine which materials are required in this zone: ${zoneLookupError}`;
        const required = byViewMaterials?.get(viewName) ?? new Set();
        if (required.size === 0) {
          return `the zone/material join found no material reported in ${viewName} to require — either the plant `
            + `is genuinely reporting nothing there right now, or the join is broken; treating as nothing to check `
            + `rather than a pass would hide the second case, so this reports the ambiguity instead of going green`;
        }

        const byName = new Map(entry.m.materials.map((mat) => [mat.name, mat]));
        const bad = [];

        /* Precondition 1: enough matched pixels to trust a median at all. */
        for (const name of required) {
          const mat = byName.get(name);
          if (!mat) { bad.push(`${name}: not found in the legend swatch scan at all`); continue; }
          if (mat.count < THRESHOLDS.materialSeparability.minPixels) {
            bad.push(`${name}: only ${mat.count} matched px, floor ${THRESHOLDS.materialSeparability.minPixels} `
              + `— too few to trust a median colour`);
          }
        }

        /* Precondition 2: each rendered median is recognisably ITS OWN material. */
        for (const name of required) {
          const mat = byName.get(name);
          if (!mat || mat.deltaEToOwnSwatch === null) continue;
          if (mat.deltaEToOwnSwatch > THRESHOLDS.materialSeparability.deltaEWindow) {
            bad.push(`${name}: rendered median is ΔE ${fmtDe(mat.deltaEToOwnSwatch)} from its own swatch, `
              + `ceiling ${THRESHOLDS.materialSeparability.deltaEWindow}`);
          }
        }

        /* The actual separability question: pairwise, rendered vs target. */
        const withColor = [...required]
          .map((name) => byName.get(name))
          .filter((mat) => mat && mat.renderedMedianLab);
        const swatchesForRequired = legendSwatches.filter((sw) => required.has(sw.name));
        if (withColor.length >= 2 && swatchesForRequired.length >= 2) {
          let minRendered = Infinity;
          for (let i = 0; i < withColor.length; i += 1) {
            for (let j = i + 1; j < withColor.length; j += 1) {
              minRendered = Math.min(minRendered, deltaE00(withColor[i].renderedMedianLab, withColor[j].renderedMedianLab));
            }
          }
          let minTarget = Infinity;
          for (let i = 0; i < swatchesForRequired.length; i += 1) {
            for (let j = i + 1; j < swatchesForRequired.length; j += 1) {
              minTarget = Math.min(minTarget, deltaE00(swatchesForRequired[i].lab, swatchesForRequired[j].lab));
            }
          }
          const ratio = minTarget > 0 ? minRendered / minTarget : null;
          console.log(`        ${viewName}: min pairwise ΔE rendered ${minRendered.toFixed(1)}, `
            + `target ${minTarget.toFixed(1)}, ratio ${ratio === null ? 'n/a' : ratio.toFixed(2)} `
            + `(floor ${THRESHOLDS.materialSeparability.minPairwiseRatio})`);
          if (ratio === null) {
            bad.push(`${viewName}: target swatches carry zero separation between each other — cannot judge a ratio against them`);
          } else if (ratio < THRESHOLDS.materialSeparability.minPairwiseRatio) {
            bad.push(`${viewName}: rendered materials separate by only ${(ratio * 100).toFixed(0)}% of their swatch `
              + `separation (min pairwise ΔE rendered ${minRendered.toFixed(1)} vs target ${minTarget.toFixed(1)}), `
              + `floor ${THRESHOLDS.materialSeparability.minPairwiseRatio}`);
          }
        } else {
          console.log(`        ${viewName}: only ${withColor.length} material(s) with a usable rendered colour — `
            + 'pairwise separability not applicable with fewer than two');
        }

        return bad.length ? bad.join('; ') : null;
      })());
    }

    console.log(`\n${ran} picture checks run, ${failed} failed`);
    /*
     * `process.exitCode`, never `process.exit()`, on the success and failure
     * paths. On Windows, with stdout piped to a file or another process,
     * `process.exit()` right after a burst of `console.log` drops whatever has
     * not been flushed yet — an eleven-minute run once ended with the exit code
     * of a failed check and NONE of the check verdicts in the captured log.
     * Setting the exit code and letting the process drain is the fix; the
     * `finally` below still kills Chrome, so nothing keeps the process alive.
     */
    if (ran === 0) { console.error('no checks executed — treating as a failure to run'); process.exitCode = 2; }
    else process.exitCode = failed ? 1 : 0;
  } catch (err) {
    console.error('COULD NOT RUN');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 2;
  } finally {
    child.kill();
    await sleep(300);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    await rm(bundleDir, { recursive: true, force: true }).catch(() => {});
  }
}

main();
