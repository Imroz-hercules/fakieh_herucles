/**
 * Verify the Plant 3D page SHELL (workstream A: immersive layout, split
 * view, legend dock, full screen) at three viewports, without a person
 * present. Modelled on `shoot-plant3d.mjs`'s CDP client and on the
 * scratchpad's `shoot-yard-numbers.mjs`.
 *
 *   node scripts/shoot-shell.mjs [outDir] [baseUrl]
 *
 * For each viewport this:
 *   1. loads /fakieh/plant-3d?fx=on and waits for window.__plant3d
 *   2. reads back the canvas element's own getBoundingClientRect(), the
 *      header height, and whether the list pane is visible
 *   3. screenshots the normal state
 *   4. clicks "Toggle full screen", waits, reads the canvas rect again
 *      (must equal innerWidth x innerHeight), screenshots it, clicks again
 *      to exit
 *
 * Same evidence caveat as shoot-plant3d.mjs: headless Chrome here rasterises
 * through SwiftShader, on the CPU. Composition and layout are real evidence;
 * frame rate is not.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] ?? join(resolve(import.meta.dirname, '..'), 'shots', 'shell'));
const BASE = process.argv[3] ?? 'http://127.0.0.1:5199';
const URL_3D = `${BASE}/fakieh/plant-3d?fx=on`;
const PORT = 9377;

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

const VIEWPORTS = [
  { name: '1280x495', width: 1280, height: 495, mobile: false, dpr: 1.5 },
  { name: '1024x768', width: 1024, height: 768, mobile: true, dpr: 1 },
  { name: '1920x1080', width: 1920, height: 1080, mobile: false, dpr: 1 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const profile = join(tmpdir(), `shell-shot-${process.pid}`);
  const chrome = findChrome();

  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--window-size=1920,1080',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));

  const results = {};

  try {
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
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, session);
    await cdp.send('Runtime.enable', {}, session);

    for (const vp of VIEWPORTS) {
      console.error(`[${vp.name}] starting`);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.dpr,
        mobile: vp.mobile,
      }, session);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile }, session);

      await cdp.send('Page.navigate', { url: URL_3D }, session);

      let ready = false;
      for (let i = 0; i < 120 && !ready; i += 1) {
        await sleep(500);
        ready = await evaluate(cdp, session, 'Boolean(window.__plant3d)').catch(() => false);
      }
      if (!ready) throw new Error(`${vp.name}: the 3D view never created a renderer`);

      /* Let the layout effects (stage measurement, dock inset, camera fit)
         settle, and advance the render loop a few frames since headless rAF
         runs slowly under SwiftShader. */
      await sleep(2000);
      await evaluate(cdp, session,
        '(() => { const s = window.__plant3d; for (let i = 0; i < 8; i += 1) s.advance(performance.now()); return 1; })()');

      const normal = await evaluate(cdp, session, `
        (() => {
          const canvas = document.querySelector('canvas');
          const header = document.querySelector('.water-page-header');
          const listPane = document.querySelector('[data-plant3d-list-pane]');
          const sheet = document.querySelector('[data-plant3d-sheet]');
          const dock = document.querySelector('[data-plant3d-dock]');
          const zoneSwitch = document.querySelector('[data-plant3d-zone-switch]');
          const r = canvas ? canvas.getBoundingClientRect() : null;
          const h = header ? header.getBoundingClientRect() : null;
          const z = zoneSwitch ? zoneSwitch.getBoundingClientRect() : null;
          return {
            canvasRect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
            headerRect: h ? { x: h.x, y: h.y, width: h.width, height: h.height } : null,
            headerHeight: h ? h.height : null,
            zoneSwitchRect: z ? { x: z.x, y: z.y, width: z.width, height: z.height } : null,
            zoneSwitchInsideHeader:
              !!(h && z && z.top >= h.top - 0.5 && z.bottom <= h.bottom + 0.5),
            zoneSwitchScrollWidth: zoneSwitch ? zoneSwitch.scrollWidth : null,
            listPaneVisible: !!(listPane && listPane.getBoundingClientRect().width > 0),
            sheetPresent: !!sheet,
            dockPresent: !!dock,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
          };
        })()
      `);

      const { data: pngNormal } = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
      const normalFile = join(OUT, `${vp.name}.png`);
      await writeFile(normalFile, Buffer.from(pngNormal, 'base64'));

      /* Full screen. */
      const clicked = await evaluate(cdp, session, `
        (() => {
          const b = [...document.querySelectorAll('button')]
            .find((x) => (x.getAttribute('aria-label') || '') === 'Toggle full screen');
          if (b) b.click();
          return Boolean(b);
        })()
      `);
      if (!clicked) throw new Error(`${vp.name}: no "Toggle full screen" button found`);
      await sleep(1000);
      await evaluate(cdp, session,
        '(() => { const s = window.__plant3d; for (let i = 0; i < 4; i += 1) s.advance(performance.now()); return 1; })()');

      const fullscreen = await evaluate(cdp, session, `
        (() => {
          const canvas = document.querySelector('canvas');
          const r = canvas ? canvas.getBoundingClientRect() : null;
          return {
            canvasRect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
          };
        })()
      `);

      const { data: pngFull } = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
      const fullFile = join(OUT, `${vp.name}-fullscreen.png`);
      await writeFile(fullFile, Buffer.from(pngFull, 'base64'));

      /* Exit full screen so the next viewport starts from the normal state. */
      await evaluate(cdp, session, `
        (() => {
          const b = [...document.querySelectorAll('button')]
            .find((x) => (x.getAttribute('aria-label') || '') === 'Toggle full screen');
          if (b) b.click();
          return Boolean(b);
        })()
      `);
      await sleep(500);

      results[vp.name] = { viewport: vp, normal, normalFile, fullscreen, fullFile };
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
