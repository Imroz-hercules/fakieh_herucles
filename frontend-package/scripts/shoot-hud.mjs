/**
 * Verify the Plant 3D HUD (workstream F: KPI strip, legend dock, silo list,
 * status colour mode, sort header, states) at two viewports, in both
 * themes, without a person present. Modelled directly on `shoot-shell.mjs`'s
 * CDP client.
 *
 *   node scripts/shoot-hud.mjs [outDir] [baseUrl]
 *
 * For each viewport this:
 *   1. loads /fakieh/plant-3d?fx=on and waits for window.__plant3d
 *   2. screenshots the dark-theme (default) state
 *   3. clicks "Toggle theme", waits, screenshots the light-theme state
 *   4. clicks the "Fill" segment of the colour-mode switch (when present —
 *      it needs `Plant3D.tsx` to have wired `colorMode`/`onColorMode`
 *      through; if it is not found this step is skipped and noted rather
 *      than treated as a failure, since that wiring belongs to another
 *      workstream) and takes one more shot of the status-mode legend/rows
 *   5. looks for `[data-plant3d-kpi]` (`KpiStrip`) and `[data-plant3d-
 *      controlbar]` (`ControlBar`) — both new, neither mounted by
 *      `Plant3D.tsx` yet — and takes one more shot if either is present.
 *      Until that page wiring lands this step finds nothing and says so in
 *      the result rather than failing the run; `verify-hud-components.mjs`
 *      is what actually exercises those two components in the meantime.
 *

 * Same evidence caveat as shoot-shell.mjs: headless Chrome here rasterises
 * through SwiftShader, on the CPU. Composition and layout are real evidence;
 * frame rate is not.
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] ?? join(resolve(import.meta.dirname, '..'), 'shots', 'hud'));
const BASE = process.argv[3] ?? 'http://127.0.0.1:5199';
const URL_3D = `${BASE}/fakieh/plant-3d?fx=on`;
const PORT = 9378;

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
];

/* Clicks a button found by its exact aria-label or visible text. Throws
   rather than silently doing nothing — the same trap `shoot-plant3d.mjs`'s
   own history warns about: a click that matches nothing must not produce a
   screenshot that looks like it worked. */
async function clickByLabel(cdp, session, label, { required = true } = {}) {
  const found = await evaluate(
    cdp,
    session,
    `(() => {
      const els = [...document.querySelectorAll('button')];
      const b = els.find((x) => (x.getAttribute('aria-label') || '').trim() === ${JSON.stringify(label)}
        || (x.textContent || '').trim() === ${JSON.stringify(label)});
      if (b) { b.click(); return true; }
      return false;
    })()`,
  );
  if (!found && required) throw new Error(`no button found for "${label}"`);
  return found;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const profile = join(tmpdir(), `hud-shot-${process.pid}`);
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
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile },
        session,
      );
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile }, session);

      await cdp.send('Page.navigate', { url: URL_3D }, session);

      let ready = false;
      for (let i = 0; i < 120 && !ready; i += 1) {
        await sleep(500);
        ready = await evaluate(cdp, session, 'Boolean(window.__plant3d)').catch(() => false);
      }
      if (!ready) throw new Error(`${vp.name}: the 3D view never created a renderer`);

      await sleep(2000);
      await evaluate(
        cdp,
        session,
        '(() => { const s = window.__plant3d; for (let i = 0; i < 8; i += 1) s.advance(performance.now()); return 1; })()',
      );

      /*
       * Headless Chrome's own `prefers-color-scheme` (and this app's theme,
       * which follows it absent a saved preference) is not guaranteed dark
       * just because that is the client's setting on the real device — a
       * fresh profile in this harness came up in light here. So the theme is
       * READ, not assumed: if the page is not already dark, one toggle click
       * forces it there before anything is captured, so the two files this
       * writes are always named for what they actually show rather than for
       * an assumed click order.
       */
      const readTheme = () =>
        evaluate(cdp, session, "document.documentElement.classList.contains('light') ? 'light' : 'dark'");

      if ((await readTheme()) !== 'dark') {
        await clickByLabel(cdp, session, 'Toggle theme');
        await sleep(400);
      }
      const themeDark = await readTheme();
      const { data: pngDark } = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
      const darkFile = join(OUT, `${vp.name}-dark.png`);
      await writeFile(darkFile, Buffer.from(pngDark, 'base64'));

      /* ---- light (toggled) ---------------------------------------------- */
      await clickByLabel(cdp, session, 'Toggle theme');
      await sleep(400);
      const themeLight = await readTheme();
      const { data: pngLight } = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
      const lightFile = join(OUT, `${vp.name}-light.png`);
      await writeFile(lightFile, Buffer.from(pngLight, 'base64'));

      /* ---- status colour mode (best-effort — depends on Plant3D.tsx
         having wired colorMode/onColorMode through to LegendDock) --------- */
      const clickedStatusMode = await clickByLabel(
        cdp,
        session,
        'Colour bins by how full they are',
        { required: false },
      );
      let statusFile = null;
      if (clickedStatusMode) {
        await sleep(300);
        const { data: pngStatus } = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
        statusFile = join(OUT, `${vp.name}-light-status-mode.png`);
        await writeFile(statusFile, Buffer.from(pngStatus, 'base64'));
      }

      /* ---- KpiStrip / ControlBar (best-effort — depends on Plant3D.tsx
         having mounted them; that wiring is a separate, still-landing
         change, so "not found" is reported rather than treated as a
         failure) ------------------------------------------------------- */
      const kpiPresent = await evaluate(
        cdp,
        session,
        "Boolean(document.querySelector('[data-plant3d-kpi]'))",
      ).catch(() => false);
      const controlBarPresent = await evaluate(
        cdp,
        session,
        "Boolean(document.querySelector('[data-plant3d-controlbar]'))",
      ).catch(() => false);
      let hudFile = null;
      if (kpiPresent || controlBarPresent) {
        const { data: pngHud } = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
        hudFile = join(OUT, `${vp.name}-light-kpi-controlbar.png`);
        await writeFile(hudFile, Buffer.from(pngHud, 'base64'));
      }

      results[vp.name] = {
        viewport: vp,
        themeDark,
        darkFile,
        themeLight,
        lightFile,
        statusModeWired: clickedStatusMode,
        statusFile,
        kpiStripWired: kpiPresent,
        controlBarWired: controlBarPresent,
        hudFile,
      };
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
