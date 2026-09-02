/**
 * Shader review shots: Raw and Finished zones, daylight, laptop size.
 *
 * Evidence for workstream 4.C (the silo shader) — no dark flank band, the
 * level ring visible on filled bins, corrugation visible at zone range, coded
 * bins clearly coloured. Adapted from the yard-numbers shooter used earlier in
 * this project; the CDP plumbing is unchanged, only the zones and output path
 * differ.
 *
 *   node scripts/shoot-shader.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9389;
const OUT = 'C:/Users/Administrator/Projects/Fakieh/frontend-package/shots/shader';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data); const w = this.p.get(m.id);
      if (!w) return; this.p.delete(m.id);
      m.error ? w.rej(new Error(m.error.message)) : w.res(m.result);
    });
  }
  send(method, params = {}, sessionId) {
    const id = (this.id += 1);
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => {
      this.p.set(id, { res, rej });
      setTimeout(() => { if (this.p.delete(id)) rej(new Error(method + ' timed out')); }, 120000);
    });
  }
}
const ev = async (cdp, s, expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

async function shootZone(cdp, sessionId, zonePattern, outFile) {
  await ev(cdp, sessionId, `(() => { const b=[...document.querySelectorAll('button')]
    .find(x=>${zonePattern}.test(x.textContent.trim())); if(b) b.click(); return !!b; })()`);
  await sleep(1000);

  /* let the camera actually arrive — frames, not seconds */
  await ev(cdp, sessionId, `
    (async () => { const s=window.__plant3d;
      for (let i=0;i<120;i++){ s.advance(performance.now()+i*16);
        await new Promise(r=>setTimeout(r,30));
        const f=window.__plant3dFraming, c=s.camera.position;
        if (Math.hypot(c.x-f.position[0],c.y-f.position[1],c.z-f.position[2]) < 0.6) break; }
      return true; })()`);
  await sleep(500);

  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(outFile, Buffer.from(data, 'base64'));
  console.log('wrote', outFile);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const chrome = CHROMES.find((p) => existsSync(p));
  if (!chrome) throw new Error('no Chrome/Edge found');
  const profile = join(tmpdir(), `shader-shots-${process.pid}`);
  const child = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1280,495', '--hide-scrollbars', '--no-first-run', '--mute-audio',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let wsUrl = null;
    for (let i = 0; i < 60 && !wsUrl; i += 1) {
      await sleep(250);
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
    }
    if (!wsUrl) throw new Error('browser never opened a debug port');
    const ws = new WebSocket(wsUrl);
    await new Promise((ok) => { ws.addEventListener('open', ok, { once: true }); });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 495, deviceScaleFactor: 1.5, mobile: false }, sessionId);
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:5199/fakieh/plant-3d?fx=on' }, sessionId);

    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) {
      await sleep(500);
      ready = await ev(cdp, sessionId, 'Boolean(window.__plant3d)').catch(() => false);
    }
    if (!ready) throw new Error('never ready');
    await sleep(2500);

    /* Daylight — the look this workstream was built against. */
    await ev(cdp, sessionId, `(() => { const b=[...document.querySelectorAll('button')]
      .find(x=>((x.getAttribute('title')||'')+(x.getAttribute('aria-label')||'')).toLowerCase().includes('daylight'));
      if(b) b.click(); return !!b; })()`);
    await sleep(800);

    await shootZone(cdp, sessionId, "/^(Raw Material|Raw)/", join(OUT, 'raw-day.png'));
    await shootZone(cdp, sessionId, "/^(Finished Feed|Finished)/", join(OUT, 'finished-day.png'));
  } finally {
    child.kill();
    await sleep(300);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('COULD NOT RUN');
  console.error(err && err.stack ? err.stack : err);
  process.exit(2);
});
