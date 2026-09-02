/**
 * Phase 2B evidence: shoot the Raw, Finished, Yard and Dosing zones at
 * 1280x495 (the laptop reference viewport) against the live dev server, so
 * the new silo archetypes — legs, rings, hatches, rails, conveyors — can be
 * reviewed on screen rather than taken on faith from the geometry maths.
 *
 * Adapted from `shoot-yard-numbers.mjs`'s headless-Chrome/CDP harness (same
 * technique, generalised to a list of zones). Also reads
 * `window.__plant3d.gl.info` for the whole-site view so the measured
 * triangle/draw-call counts in the report are a live GPU read, not the
 * headless geometry-only estimate `checkTriangleBudget` computes.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9491;
const DEV_PORT = 5199;
const OUT = 'C:/Users/Administrator/Projects/Fakieh/frontend-package/shots/archetypes';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.p = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      const w = this.p.get(m.id);
      if (!w) return;
      this.p.delete(m.id);
      m.error ? w.rej(new Error(m.error.message)) : w.res(m.result);
    });
  }
  send(method, params = {}, sessionId) {
    const id = (this.id += 1);
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => {
      this.p.set(id, { res, rej });
      setTimeout(() => {
        if (this.p.delete(id)) rej(new Error(method + ' timed out'));
      }, 120000);
    });
  }
}

const ev = async (cdp, s, expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

const ZONES = [
  { file: 'raw', zoneMatch: '^(Raw Material|Raw)' },
  { file: 'finished', zoneMatch: '^(Finished Feed|Finished)' },
  { file: 'yard', zoneMatch: '^(Outside Yard|Yard)' },
  { file: 'dosing', zoneMatch: '^(Minerals|Dosing)' },
];

async function shootZone(cdp, sessionId, zone, retry = false) {
  await ev(
    cdp,
    sessionId,
    `(() => { const b=[...document.querySelectorAll('button')]
      .find(x=>new RegExp(${JSON.stringify(zone.zoneMatch)}).test(x.textContent.trim()));
      if(b) b.click(); return !!b; })()`,
  );
  await sleep(900);
  /* let the camera actually arrive — frames, not seconds */
  await ev(
    cdp,
    sessionId,
    `(async () => { const s=window.__plant3d;
      for (let i=0;i<150;i++){ s.advance(performance.now()+i*16);
        await new Promise(r=>setTimeout(r,30));
        const f=window.__plant3dFraming, c=s.camera.position;
        if (f && Math.hypot(c.x-f.position[0],c.y-f.position[1],c.z-f.position[2]) < 0.6) break; }
      return true; })()`,
  );
  await sleep(400);

  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const buf = Buffer.from(data, 'base64');
  if (buf.length < 2000 && !retry) {
    console.log(`  ${zone.file}: suspiciously small (${buf.length} bytes) — retrying once`);
    await sleep(1200);
    return shootZone(cdp, sessionId, zone, true);
  }
  const file = join(OUT, `${zone.file}.png`);
  await writeFile(file, buf);
  console.log(`  wrote ${file} (${buf.length} bytes)`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const chrome = CHROMES.find((p) => existsSync(p));
  if (!chrome) throw new Error('no Chrome/Edge binary found');
  const profile = join(tmpdir(), `archetypes-${process.pid}`);
  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--window-size=1280,495',
      '--hide-scrollbars',
      '--no-first-run',
      '--mute-audio',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let wsUrl = null;
    for (let i = 0; i < 60 && !wsUrl; i += 1) {
      await sleep(250);
      try {
        wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
      } catch {
        /* keep polling */
      }
    }
    if (!wsUrl) throw new Error('chrome devtools endpoint never came up');
    const ws = new WebSocket(wsUrl);
    await new Promise((ok) => {
      ws.addEventListener('open', ok, { once: true });
    });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 495, deviceScaleFactor: 1.5, mobile: false },
      sessionId,
    );
    await cdp.send(
      'Page.navigate',
      { url: `http://127.0.0.1:${DEV_PORT}/fakieh/plant-3d?fx=on` },
      sessionId,
    );

    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) {
      await sleep(500);
      ready = await ev(cdp, sessionId, 'Boolean(window.__plant3d)').catch(() => false);
    }
    if (!ready) throw new Error('page never exposed window.__plant3d');
    await sleep(2500);

    /* daylight, so structure reads instead of atmosphere */
    await ev(
      cdp,
      sessionId,
      `(() => { const b=[...document.querySelectorAll('button')]
        .find(x=>((x.getAttribute('title')||'')+(x.getAttribute('aria-label')||'')).toLowerCase().includes('daylight'));
        if(b) b.click(); return !!b; })()`,
    );
    await sleep(600);

    for (const zone of ZONES) {
      console.log(`shooting ${zone.file}...`);
      await shootZone(cdp, sessionId, zone);
    }

    /* whole-site view + gl.info read */
    await ev(
      cdp,
      sessionId,
      `(() => { const b=[...document.querySelectorAll('button')]
        .find(x=>/^(Whole site|All)/.test(x.textContent.trim())); if(b) b.click(); return !!b; })()`,
    );
    await sleep(900);
    await ev(
      cdp,
      sessionId,
      `(async () => { const s=window.__plant3d;
        for (let i=0;i<150;i++){ s.advance(performance.now()+i*16);
          await new Promise(r=>setTimeout(r,30));
          const f=window.__plant3dFraming, c=s.camera.position;
          if (f && Math.hypot(c.x-f.position[0],c.y-f.position[1],c.z-f.position[2]) < 0.6) break; }
        return true; })()`,
    );
    await sleep(500);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile(join(OUT, 'site.png'), Buffer.from(data, 'base64'));
    console.log(`  wrote ${join(OUT, 'site.png')}`);

    const info = await ev(
      cdp,
      sessionId,
      `(() => { const i = window.__plant3d.gl.info;
        return { triangles: i.render.triangles, calls: i.render.calls, points: i.render.points, lines: i.render.lines }; })()`,
    );
    console.log('whole-site gl.info:', JSON.stringify(info));
  } finally {
    child.kill();
    await sleep(300);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});
