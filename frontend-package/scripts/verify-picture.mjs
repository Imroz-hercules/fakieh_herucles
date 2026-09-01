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
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5199';
const URL_3D = `${BASE}/fakieh/plant-3d?fx=on`;
const PORT = 9355;
/* The client's real laptop, measured by driving the live page on it. Every
   threshold below is for THIS size; the roomier window flatters all of them. */
const WIDTH = 1280;
const HEIGHT = 495;
const DPR = 1.5;

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
 * Renders twice and diffs. Runs entirely in the page, because reading pixels
 * needs the frame that is currently in the drawing buffer — a screenshot taken
 * over the wire has already lost it.
 *
 * `preserveDrawingBuffer` is not set on this context, so the read has to happen
 * in the same task as the draw. Hence the explicit gl.render() calls rather
 * than waiting for the loop.
 */

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
    if (gap < Math.max(0.3, viewDist * 0.006)) {
      return { ok: true, frames: i + 1, gap, viewDist };
    }
  }
  return { ok: false, why: 'the camera never reached the computed framing', gap };
})()
`;

const MEASURE = `
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
  for (let p = 0; p < composed.length; p += 4) {
    const lum = (0.2126 * composed[p] + 0.7152 * composed[p+1] + 0.0722 * composed[p+2]) / 255;
    lumSum += lum;
    deciles[Math.min(9, Math.floor(lum * 10))] += 1;
  }

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
  const silos = [];
  scene.traverse((o) => { if (o.isInstancedMesh && o.count > 0) silos.push(o); });
  if (!silos.length) return { error: 'no instanced silo meshes in the scene at all' };
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

  let n = 0, minX = w, maxX = -1, minY = h, maxY = -1;
  for (let p = 0; p < mask.length; p += 4) {
    if (mask[p] + mask[p+1] + mask[p+2] <= 6) continue;
    n += 1;
    const i = p / 4, x = i % w, y = (i / w) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  const total = mask.length / 4;
  return {
    stage: [w, h],
    instancedMeshes: silos.length,
    instances: silos.reduce((a, o) => a + o.count, 0),
    siloPixels: n,
    coverage: n / total,
    box: maxX < 0 ? null : { w: maxX - minX + 1, h: maxY - minY + 1, minX, minY },
    meanLuminance: lumSum / total,
    midtones: (deciles[3] + deciles[4] + deciles[5] + deciles[6]) / total,
    draws: gl.info.render.calls,
    tris: gl.info.render.triangles,
  };
})()
`;

async function main() {
  const chrome = CHROMES.find((p) => existsSync(p));
  if (!chrome) { console.error('COULD NOT RUN — no Chrome or Edge found'); process.exit(2); }
  const profile = join(tmpdir(), `plant3d-picture-${process.pid}`);

  const child = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    `--window-size=${WIDTH},${HEIGHT}`, '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  try {
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
    await cdp.send('Page.navigate', { url: URL_3D }, session);

    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) {
      await sleep(500);
      ready = await evaluate(cdp, session, 'Boolean(window.__plant3d)').catch(() => false);
    }
    if (!ready) throw new Error('the 3D view never created a renderer');
    await sleep(3000);

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

    const results = [];
    for (const view of VIEWS) {
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
      const first = await evaluate(cdp, session, MEASURE);
      if (first.error) throw new Error(`${view.name}: ${first.error}`);
      /* Still measured twice, but now as a check on the MEASUREMENT rather than
         a wait for the camera — the camera is already proven to have arrived. */
      await evaluate(cdp, session, CONVERGE);
      const m = await evaluate(cdp, session, MEASURE);
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
      results.push({ view, m });
      console.log(
        `      ${view.name.padEnd(14)} coverage ${(m.coverage * 100).toFixed(2)}% `
        + `box ${m.box ? `${m.box.w}x${m.box.h}` : 'none'} `
        + `instances ${m.instances} mean ${(m.meanLuminance * 100).toFixed(0)}% `
        + `mid ${(m.midtones * 100).toFixed(0)}%`,
      );
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

    console.log(`\n${ran} picture checks run, ${failed} failed`);
    if (ran === 0) { console.error('no checks executed — treating as a failure to run'); process.exit(2); }
    process.exit(failed ? 1 : 0);
  } catch (err) {
    console.error('COULD NOT RUN');
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
  } finally {
    child.kill();
    await sleep(300);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main();
