/**
 * Screenshots the Plant 3D looks (workstream 4.D) for visual review:
 * whole site + Raw Material + Outside Yard + Finished Feed, each in day,
 * dusk and night, at 1280x495 (the client's laptop canvas size) into
 * `shots/looks/`.
 *
 * Adapted from `shoot-shell.mjs`'s CDP client and viewport-capture pattern;
 * the view/look navigation follows `verify-picture.mjs`'s own `setLook` and
 * zone-button-matching conventions so this reuses the exact same selectors
 * that harness already proved work.
 *
 *   node scripts/shoot-looks.mjs [outDir] [baseUrl]
 *
 * SAME EVIDENCE CAVEAT AS EVERY OTHER HEADLESS SHOT IN THIS PROJECT: this
 * renders through SwiftShader (a software rasteriser) in headless Chrome.
 * It is real evidence for composition, framing and relative tone — it is
 * NOT evidence for frame rate, and colours will differ in fine detail from
 * a real GPU's driver. Composition and structure are what these prove;
 * the final look is judged on the client's own laptop.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] ?? join(resolve(import.meta.dirname, '..'), 'shots', 'looks'));
const BASE = process.argv[3] ?? 'http://127.0.0.1:5199';
const URL_3D = `${BASE}/fakieh/plant-3d?fx=on`;
const PORT = 9411;
const WIDTH = 1280;
const HEIGHT = 495;
const DPR = 1.5;

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
function findChrome() {
  for (const p of CHROMES) if (existsSync(p)) return p;
  throw new Error('no Chrome or Edge found');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Pumps `state.advance()` until the camera reaches the framing `CameraRig`
 *  published (`window.__plant3dFraming`) — real time is not a reliable
 *  currency under headless SwiftShader (see the note preserved from
 *  `verify-picture.mjs`'s own `CONVERGE`), so this forces render frames
 *  directly rather than sleeping. */
const CONVERGE = `
(async () => {
  const s = window.__plant3d;
  const f = window.__plant3dFraming;
  if (!s) return { ok: false, why: 'no renderer' };
  if (!f) return { ok: false, why: 'no __plant3dFraming' };
  let gap = Infinity;
  for (let i = 0; i < 150; i += 1) {
    s.advance(performance.now() + i * 16);
    await new Promise((r) => setTimeout(r, 30));
    const c = s.camera.position;
    const fr = window.__plant3dFraming;
    const t = fr.position;
    gap = Math.hypot(c.x - t[0], c.y - t[1], c.z - t[2]);
    const viewDist = Math.hypot(t[0] - fr.target[0], t[1] - fr.target[1], t[2] - fr.target[2]);
    if (gap < Math.max(0.6, viewDist * 0.006)) return { ok: true, frames: i + 1, gap };
  }
  return { ok: false, why: 'never converged', gap };
})()
`;

const LOOKS = [
  { key: 'day', title: 'Daylight' },
  { key: 'dusk', title: 'Dusk' },
  { key: 'night', title: 'Night' },
];

const VIEWS = [
  { key: 'whole-site', accept: ['Whole site', 'All'] },
  { key: 'raw', accept: ['Raw Material', 'Raw'] },
  { key: 'yard', accept: ['Outside Yard', 'Yard'] },
  { key: 'finished', accept: ['Finished Feed', 'Finished'] },
];

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
}

async function setView(cdp, session, accept) {
  const hit = await evaluate(cdp, session, `
    (() => {
      const names = ${JSON.stringify(accept)};
      const b = [...document.querySelectorAll('button')]
        .find((x) => names.some((n) => x.textContent.trim().startsWith(n)));
      if (b) b.click();
      return Boolean(b);
    })()
  `);
  if (!hit) throw new Error(`no zone control matched ${accept.join(' / ')}`);
  await sleep(300);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const profile = join(tmpdir(), `looks-shot-${process.pid}`);
  const chrome = findChrome();

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
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));

  const results = [];

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
    if (!wsUrl) throw new Error(`browser never opened a debug port.\n${stderr.join('')}`);

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
    if (!ready) throw new Error('the 3D view never created a renderer within 60s');
    await sleep(1500);

    for (const look of LOOKS) {
      await setLook(cdp, session, look.title);
      for (const view of VIEWS) {
        await setView(cdp, session, view.accept);
        const arrival = await evaluate(cdp, session, CONVERGE);
        if (!arrival.ok) {
          console.error(`[${look.key}/${view.key}] did not converge: ${arrival.why} (gap ${arrival.gap})`);
        }
        /* A few extra settled frames so the shadow bake / BakeShadows
           on-demand update has a chance to run at the final camera position. */
        await evaluate(cdp, session,
          '(() => { const s = window.__plant3d; for (let i = 0; i < 6; i += 1) s.advance(performance.now()); return 1; })()');

        const { data: png } = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
        const file = join(OUT, `${look.key}-${view.key}.png`);
        await writeFile(file, Buffer.from(png, 'base64'));
        results.push({ look: look.key, view: view.key, file, converged: arrival.ok, frames: arrival.frames });
        console.error(`[${look.key}/${view.key}] ${arrival.ok ? `converged in ${arrival.frames} frames` : 'DID NOT CONVERGE'} -> ${file}`);
      }
    }

    console.log(JSON.stringify(results, null, 2));
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
