/**
 * Screenshot the Plant 3D view from this machine, without a person present.
 *
 *   node scripts/shoot-plant3d.mjs [outDir] [baseUrl]
 *
 * WHY THIS EXISTS
 * ---------------
 * The only browser this project could be looked at in was a laptop across a
 * Tailscale link, and a minimised or backgrounded Chrome tab is worse than no
 * browser at all: it suspends `requestAnimationFrame`, throttles React's
 * scheduler, and hands back a stale frame that looks completely convincing.
 * A click would light up a button in the DOM while the 3D scene behind it kept
 * rendering the previous time-of-day. Every colour judgement made that way is
 * a judgement about an image that is no longer on screen.
 *
 * So this drives a real Chrome on this machine over the DevTools Protocol,
 * waits for the scene to actually draw, and writes PNGs that can be looked at.
 *
 * WHAT IT IS AND IS NOT EVIDENCE FOR
 * ----------------------------------
 * Headless Chrome here rasterises through SwiftShader, on the CPU. The shaders,
 * the tone mapping curve, the post chain and the geometry are all identical to
 * a GPU run, so **composition, colour, contrast and layout are real evidence**.
 * Frame rate is NOT: nothing about SwiftShader's speed says anything about the
 * client's Intel Iris Xe. Do not quote timings from this script.
 *
 * The page detects a software rasteriser and drops to a cheap path with no
 * post-processing — which would mean screenshots with no ACES tone mapping and
 * every value above 1.0 clipped to white, i.e. exactly the bug this project
 * already spent hours on. So the script presses the quality control to force
 * the full path back on, and FAILS if it cannot confirm it did.
 *
 * No dependencies: Node 22 has a global WebSocket, which is all CDP needs.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] ?? join(resolve(import.meta.dirname, '..'), 'shots'));
const BASE = process.argv[3] ?? 'http://127.0.0.1:5199';
const URL_3D = `${BASE}/fakieh/plant-3d?fx=on`;
const PORT = 9333;
const WIDTH = 1600;
const HEIGHT = 1000;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

function findChrome() {
  for (const p of CHROMES) if (existsSync(p)) return p;
  throw new Error('no Chrome or Edge found');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal CDP client over one WebSocket. */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
      else p.resolve(msg.result);
    });
  }

  send(method, params = {}, sessionId) {
    const id = (this.id += 1);
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 120_000);
    });
  }
}

/** Evaluate in the page and return the value, throwing on a page-side throw. */
async function evaluate(cdp, session, expression) {
  const r = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    session,
  );
  if (r.exceptionDetails) {
    throw new Error(`page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  }
  return r.result.value;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const profile = join(tmpdir(), `plant3d-shot-${process.pid}`);
  const chrome = findChrome();

  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      /* WebGL2 on the CPU. three 0.169 asks for a webgl2 context and throws
         without one, so a plain --disable-gpu run renders nothing at all. */
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));

  let cdp;
  let session;
  try {
    /* Wait for the debugging endpoint rather than guessing at a sleep. */
    let wsUrl = null;
    for (let i = 0; i < 60 && !wsUrl; i += 1) {
      await sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        wsUrl = (await res.json()).webSocketDebuggerUrl;
      } catch {
        /* not up yet */
      }
    }
    if (!wsUrl) throw new Error(`browser never opened a debug port.\n${stderr.join('')}`);

    const ws = new WebSocket(wsUrl);
    await new Promise((ok, bad) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', () => bad(new Error('debug socket failed')), { once: true });
    });
    cdp = new CDP(ws);

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    ({ sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));

    await cdp.send('Page.enable', {}, session);
    await cdp.send('Runtime.enable', {}, session);
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }, session);

    await cdp.send('Page.navigate', { url: URL_3D }, session);

    /* Wait for the renderer to exist, not for a timer. `__plant3d` is the r3f
       root state, published in DEV by `onCreated` — so its presence means the
       WebGL context was created and the first frame ran. */
    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) {
      await sleep(500);
      ready = await evaluate(cdp, session, 'Boolean(window.__plant3d)').catch(() => false);
    }
    if (!ready) throw new Error('the 3D view never created a renderer');

    /*
     * Force the full-quality path.
     *
     * SwiftShader trips the software-renderer detection, which drops the post
     * chain — and without the ToneMapping effect in that chain, everything above
     * 1.0 clips flat to white. Screenshots taken in that state would show a
     * washed-out scene and blame the art direction for a rendering fallback.
     */
    /*
     * ...which is why this no longer presses any of it.
     *
     * This used to click the diagnostics gear and then the "high" quality
     * button. Three things were wrong with that, and they compounded:
     *
     *   It was redundant. `?fx=on` (in URL_3D) sets `forceFx` and clears
     *   `lowPower` directly — Plant3D.tsx:1380-1387 — which is the whole job.
     *   The buttons were a second, weaker way of doing what the URL already did.
     *
     *   It did the exact thing the code it was working around warns against.
     *   Plant3D.tsx's own comment on that override says driving it "through the
     *   quality buttons instead would tie the harness to the HUD's markup,
     *   which is exactly the thing most likely to be rewritten". The harness
     *   was doing both.
     *
     *   Worst: it left the diagnostics panel OPEN, and never closed it. That
     *   panel defaults to false in production (Plant3D.tsx:1199). So every
     *   reference screenshot this project has reviewed carried a bottom card
     *   that no user will ever see, which changed the measured HUD inset, which
     *   changed the camera framing, which made the subject smaller — in the
     *   images used to judge whether the subject was too small. It also stamped
     *   a meaningless "2 fps" on pictures presented as the reference look.
     *
     * So the screenshots are now of the composition the page actually renders.
     * Nothing here forces anything; if `?fx=on` failed to take, the effectsOn
     * gate below refuses the run rather than quietly writing cheap-path images.
     * That guard already existed and is the honest place for this to fail.
     */
    const forced = { via: '?fx=on', clickedHud: false };
    await sleep(2500);

    const post = await evaluate(cdp, session, `
      (() => {
        const s = window.__plant3d;
        for (let i = 0; i < 6; i += 1) s.advance(performance.now());
        return { toneMapping: s.gl.toneMapping, draws: s.gl.info.render.calls,
                 tris: s.gl.info.render.triangles, vis: document.visibilityState };
      })()
    `);
    /* toneMapping 0 = NoToneMapping, which the EffectComposer sets when it owns
       the chain. Seeing 0 here is how we know the post pass is actually on. */
    /*
     * Two separate questions, which this used to conflate into one.
     *
     * It asserted `toneMapping === 0 && draws > 100`. The first half is the real
     * test — the EffectComposer sets NoToneMapping when it takes over, so a 0
     * here means the post chain owns the frame. The second half was a rough
     * proxy for "the scene actually drew something", calibrated against a
     * whole-site view of 131 bins.
     *
     * Then the default view became a single zone of 18 bins, 80 draws was the
     * correct and healthy number, and the harness refused a perfectly good run.
     * A threshold tuned to one situation quietly became a false alarm in
     * another — the same shape of mistake as a check that cannot fail, just
     * pointing the other way.
     *
     * So they are asked separately, and the scene test is on triangles, which
     * does not move with how many draw calls the composer happens to add.
     */
    const postRunning = post.toneMapping === 0;
    const sceneDrew = post.tris > 1000;
    const effectsOn = postRunning && sceneDrew;

    /*
     * Zone names are the button labels from `ZONES` in `site.ts`, NOT the zone
     * ids. They are not the same and the difference already produced a false
     * screenshot: this asked for a button starting with "Dosing", the label is
     * "Minerals & Micro", the click found nothing, the click silently did
     * nothing, and `05-zone-dosing.png` was another picture of the raw-material
     * bank with a filename saying otherwise. It was reviewed as evidence.
     *
     * That is this project's oldest failure mode wearing a new hat — a step
     * that reports success while doing nothing at all — so a click that finds
     * no target is now a hard failure, below.
     */
    /*
     * ...and the same failure mode had a second head, which the click guard
     * above could not have caught, because there was no click to guard.
     *
     * The first three shots named no zone at all. They inherited whatever zone
     * happened to be selected, which is a thing this page decides, not the
     * harness: the default view is now a single zone rather than the whole
     * site, so `01-site-day.png` was a picture of the Outside Yard filed under
     * a name that says "site", and `07-zone-yard.png` was the same view a
     * second time. Three of seven reference shots were wrong, and every one of
     * them was reviewed as evidence for how the site view looks.
     *
     * A click that finds nothing now throws. A shot that never asked for a
     * zone had nothing to throw about — so every shot names its zone, and the
     * zone is read back off the page after the camera settles.
     *
     * `Whole site` collapses to `All` on a narrow viewport, so the readback
     * accepts either rather than pinning the assertion to a layout breakpoint.
     */
    /*
     * ...and a third head, found the moment this ran at two window sizes.
     *
     * Every zone tab has TWO labels. `PlantHud.tsx` renders `z.label` when
     * there is room and `z.short` when there is not — "Whole site" becomes
     * "All", "Outside Yard" becomes "Yard", "Minerals & Micro" becomes
     * "Dosing" — and which one is on screen depends on the width of the
     * window. Pinning this script to the long labels made it a script that
     * only worked on a wide screen, which is the opposite of what adding the
     * laptop viewport was for: it threw rather than lying, correctly, but it
     * would have blocked shooting the one size that actually ships.
     *
     * So a zone is a LIST of the names it can appear under, and both the click
     * and the readback accept any of them. The list is not guessed: the long
     * names are `label` and the short ones are `short`, both in `ZONES` in
     * site.ts, and "Whole site"/"All" is the literal ternary at PlantHud.tsx.
     */
    const WHOLE_SITE = ['Whole site', 'All'];
    const shots = [
      /*
       * `setup: 'day'` and not null, and this is the same defect a third time.
       *
       * A null setup meant "whatever the page defaults to", which was fine when
       * this file was one pass over one viewport. It now runs the whole list
       * once per viewport WITHOUT reloading, so the first shot of the laptop
       * pass inherited the time of day left behind by the last shot of the
       * desktop pass. The picture came out in daylight, under a filename saying
       * day, at a moment when the page's actual default had been changed to
       * dusk — so it was simultaneously right about its filename and wrong
       * about what it claimed to be evidence of.
       *
       * Same lesson as the zone fields above and the toggle below: a shot that
       * does not state what it wants is a shot of whatever the last one left.
       */
      { name: '01-site-day', setup: 'day', zone: 'Whole site', accept: WHOLE_SITE },
      { name: '02-site-dusk', setup: 'dusk', zone: 'Whole site', accept: WHOLE_SITE },
      { name: '03-site-night', setup: 'night', zone: 'Whole site', accept: WHOLE_SITE },
      { name: '04-zone-raw', setup: 'day', zone: 'Raw Material', accept: ['Raw Material', 'Raw'] },
      { name: '05-zone-dosing', setup: 'day', zone: 'Minerals & Micro', accept: ['Minerals', 'Dosing'] },
      { name: '06-zone-finished', setup: 'day', zone: 'Finished Feed', accept: ['Finished Feed', 'Finished'] },
      { name: '07-zone-yard', setup: 'day', zone: 'Outside Yard', accept: ['Outside Yard', 'Yard'] },
      /* Press Buffer has only 5 bins and was the one zone never photographed,
         so it was also the one zone no reviewer could have commented on. */
      { name: '08-zone-press', setup: 'day', zone: 'Press Buffer', accept: ['Press Buffer', 'Buffer'] },
      /*
       * Silo numbers on. Last, because it leaves a toggle flipped — every shot
       * before it is of the default state, which is what the other views are
       * meant to show. Raw Material is the useful zone to prove it in: 22 bins
       * in a tight row is the case where labels would collide if the culling
       * were not doing its job, so a clean picture here is evidence and a
       * sparse one at whole-site zoom would not have been.
       */
      {
        name: '09-zone-raw-numbers',
        setup: 'day',
        zone: 'Raw Material',
        accept: ['Raw Material', 'Raw'],
        toggle: 'Show silo numbers',
      },
    ];

    const written = [];
    /* A click that finds nothing throws, naming what it looked for and listing
       what was actually on the page. A screenshot of the wrong thing under the
       right filename is worse than no screenshot. */
    const clickOrFail = async (what, finderJs) => {
      const found = await evaluate(cdp, session, `
        (() => {
          const all = [...document.querySelectorAll('button')];
          const b = all.find(${finderJs});
          if (b) b.click();
          return { hit: Boolean(b), labels: all.map((x) => (x.textContent || '').trim()).filter(Boolean).slice(0, 30) };
        })()
      `);
      if (!found.hit) {
        throw new Error(
          `no control matched ${what}. Buttons on the page: ${found.labels.join(' | ')}`,
        );
      }
    };

    /*
     * Proves the PAGE agrees, not just that a button was clicked.
     *
     * `clickOrFail` establishes that something on screen matched and received
     * a click. It cannot establish that the click did anything: a disabled
     * control, a handler that threw, a click landing on a stale element from
     * the previous render all pass it and all leave the old zone on screen.
     * That gap is the exact shape of every evidence defect this project has
     * had, so the zone is read back from the rendered DOM instead of assumed.
     *
     * `aria-pressed` is the source of truth because the component sets it from
     * the same `active` prop that drives the styling (PlantHud.tsx) — so this
     * cannot drift from what a viewer sees without the chip also looking wrong.
     */
    /* `aria-pressed` is also carried by the diagnostics and material-key
       toggles, so the readback is narrowed to the zone switcher by matching
       against the zone labels themselves. Without that, a pressed toggle whose
       text happened to share a prefix could satisfy the assertion — a check
       that passes for the wrong reason is the thing being fixed here. */
    const ZONE_LABELS = [
      ...WHOLE_SITE,
      'Outside Yard', 'Yard', 'Raw Material', 'Raw', 'Minerals', 'Dosing',
      'Press Buffer', 'Buffer', 'Finished Feed', 'Finished',
    ];
    const assertZone = async (shot) => {
      const want = shot.accept ?? [shot.zone];
      const got = await evaluate(cdp, session, `
        (() => {
          const labels = ${JSON.stringify(ZONE_LABELS)};
          const pressed = [...document.querySelectorAll('button[aria-pressed="true"]')]
            .map((x) => (x.textContent || '').trim());
          return { zone: pressed.filter((p) => labels.some((l) => p.startsWith(l))), pressed };
        })()
      `);
      const ok = got.zone.length === 1 && want.some((w) => got.zone[0].startsWith(w));
      if (!ok) {
        throw new Error(
          `${shot.name}: asked for zone "${shot.zone}" but the page reports `
          + `[${got.zone.join(' | ')}] selected (all pressed: ${got.pressed.join(' | ')}). `
          + 'Refusing to write a screenshot under a name it did not earn.',
        );
      }
    };

    /*
     * Two sizes, because one of them is the one that actually ships.
     *
     * This script has always shot at 1600x1000, which gives a 3D stage of
     * 1284x830. The client's laptop was then measured directly, driving the
     * live page on it with document.visibilityState confirmed visible: its
     * window is 1280x495 and its stage is 965x326. That is 2.5x SHORTER and
     * three quarters as wide, an aspect of 2.96 rather than 1.55.
     *
     * Height is the binding constraint on every camera fit in this view, so
     * every framing judgement made against the tall frame was made against a
     * picture nobody looks at — including several of mine, and including the
     * measured claims in fitToBounds about what the HUD reservations cost. A
     * 96 px top inset is 12% of an 830 px stage and 29% of a 326 px one.
     *
     * The laptop size is listed second but it is the primary evidence. The
     * roomy one is kept because it is easier to SEE a defect in, not because
     * it is what anyone will run.
     */
    const VIEWPORTS = [
      { name: 'desktop', width: WIDTH, height: HEIGHT, dir: OUT },
      { name: 'laptop', width: 1280, height: 495, dir: join(OUT, 'laptop') },
      /*
       * A tablet, because this is a plant floor and the operator may well not
       * be at a desk. 1024x768 landscape is the smallest common one and the
       * hardest case here: `compact` engages on either axis, and the zone
       * switcher, the status row and the material key all have to survive it.
       * Portrait is not shot — a 3D site view of a 280 m plant in a tall thin
       * frame is a different design problem, not a smaller version of this one,
       * and pretending one screenshot covers it would be worse than admitting
       * it is untested.
       */
      { name: 'tablet', width: 1024, height: 768, dir: join(OUT, 'tablet') },
    ];

    for (const vp of VIEWPORTS) {
      await mkdir(vp.dir, { recursive: true });
      /*
       * `Emulation.setDeviceMetricsOverride` rather than relaunching Chrome:
       * the page stays alive, so this measures the same session responding to
       * a resize, which is also what the real HUD does when a window changes.
       * deviceScaleFactor 1.5 matches the laptop's measured devicePixelRatio.
       */
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.name === 'laptop' ? 1.5 : 1,
        mobile: false,
      }, session);
      /* The HUD measures its own height to compute the camera insets, and the
         camera then eases to the new framing; both need a moment. */
      await sleep(1500);

    for (const shot of shots) {
      if (shot.setup) {
        await clickOrFail(
          `time of day "${shot.setup}"`,
          `(x) => (x.getAttribute('title') || x.getAttribute('aria-label') || '').toLowerCase().includes(${JSON.stringify(shot.setup)})`,
        );
        /*
         * Read back, for the same reason the zone is read back.
         *
         * `clickOrFail` proves a matching button existed and received a click.
         * It cannot prove the click did anything — a disabled control, a
         * handler that threw, a click landing on a stale element all satisfy
         * it. That gap is what the zone readback was built to close, and an
         * audit pointed out this call and the toggle below still had it. It
         * has never been seen to misfire; that is not a reason to leave the
         * same hole open in two of three places.
         */
        const lit = await evaluate(cdp, session, `
          (() => {
            const b = [...document.querySelectorAll('button[aria-pressed="true"]')]
              .find((x) => ((x.getAttribute('title') || '') + (x.getAttribute('aria-label') || ''))
                .toLowerCase().includes(${JSON.stringify(shot.setup)}));
            return Boolean(b);
          })()
        `);
        if (!lit) {
          throw new Error(
            `${shot.name}: clicked the "${shot.setup}" control but the page does not `
            + 'report it selected. Refusing to write a screenshot of an unknown time of day.',
          );
        }
      }
      if (shot.zone) {
        /* Accepts either the long or the short label — see the note on the
           shots table. Matching only the long one made this a wide-screen-only
           script. */
        const names = shot.accept ?? [shot.zone];
        await clickOrFail(
          `zone "${shot.zone}"`,
          `(x) => ${JSON.stringify(names)}.some((n) => x.textContent.trim().startsWith(n))`,
        );
      }
      if (shot.toggle) {
        /*
         * Set, not pressed. The shot list runs once PER VIEWPORT, so a blind
         * click flipped this on for the desktop pass, back OFF for the laptop
         * pass and on again for the tablet — and the laptop is the size that
         * matters, so the one reference image of this feature was an image of
         * the feature switched off. A toggle driven by clicking is stateful
         * across passes; a toggle driven by its aria-pressed value is not.
         */
        const set = await evaluate(cdp, session, `
          (() => {
            const b = [...document.querySelectorAll('button')]
              .find((x) => (x.getAttribute('aria-label') || '') === ${JSON.stringify(shot.toggle)});
            if (!b) return { found: false };
            const on = b.getAttribute('aria-pressed') === 'true';
            if (!on) b.click();
            return { found: true, clicked: !on };
          })()
        `);
        if (!set.found) throw new Error(`no toggle labelled "${shot.toggle}" on the page`);
        /* Same readback: setting is not the same as having been set. */
        const on = await evaluate(cdp, session, `
          (() => {
            const b = [...document.querySelectorAll('button')]
              .find((x) => (x.getAttribute('aria-label') || '') === ${JSON.stringify(shot.toggle)});
            return Boolean(b) && b.getAttribute('aria-pressed') === 'true';
          })()
        `);
        if (!on) {
          throw new Error(
            `${shot.name}: "${shot.toggle}" did not turn on. Refusing to write a `
            + 'screenshot of the feature switched off under a filename saying otherwise.',
          );
        }
      }
      /* The camera eases into place over ~1s; give it that plus a few frames. */
      await sleep(2200);
      await evaluate(cdp, session,
        '(() => { const s = window.__plant3d; for (let i = 0; i < 8; i += 1) s.advance(performance.now()); return 1; })()');

      /* After the camera has settled, so this reads the state the pixels were
         actually rendered from rather than the state that was requested. */
      await assertZone(shot);

      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
      const file = join(vp.dir, `${shot.name}.png`);
      await writeFile(file, Buffer.from(data, 'base64'));
      written.push(file);

      /* Put it back, so every other shot in every later pass is of the default
         state rather than of whatever the previous shot happened to leave on. */
      if (shot.toggle) {
        await evaluate(cdp, session, `
          (() => {
            const b = [...document.querySelectorAll('button')]
              .find((x) => (x.getAttribute('aria-label') || '') === ${JSON.stringify(shot.toggle)});
            if (b && b.getAttribute('aria-pressed') === 'true') b.click();
            return true;
          })()
        `);
      }
    }
    }

    console.log(JSON.stringify({
      renderer: await evaluate(cdp, session, `
        (() => { const g = document.createElement('canvas').getContext('webgl2');
                 const d = g.getExtension('WEBGL_debug_renderer_info');
                 return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()
      `),
      forcedQuality: forced,
      effectsOn,
      post,
      shots: written,
    }, null, 2));

    if (!effectsOn) {
      console.error(
        postRunning
          ? 'REFUSING TO CALL THESE GOOD: the scene barely drew (' + post.tris + ' triangles). ' +
            'Something is wrong with the view, not with the post chain.'
          : 'REFUSING TO CALL THESE GOOD: the post chain is not running, so these ' +
            'images have no tone mapping and everything above 1.0 is clipped white. ' +
            'They show the cheap fallback path, not the view.',
      );
      process.exitCode = 2;
    }
  } finally {
    child.kill();
    await sleep(400);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(2);
});
