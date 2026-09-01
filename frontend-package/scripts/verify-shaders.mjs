/**
 * Compile the real silo and ground shaders on a real GL driver.
 *
 *   node scripts/verify-shaders.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * A shader compile error shipped, and every static check passed. `uY0` gained a
 * use in the FRAGMENT stage while being declared only in the VERTEX stage; the
 * program failed to link; three carried on; every silo rendered BLACK. `tsc`
 * was clean, the build was clean, and all of `verify-plant3d.mjs` said ok —
 * including a check named "the patched shader declares everything it uses",
 * which is a hardcoded whitelist of identifier names and therefore cannot see
 * anything added after it was written.
 *
 * Two things follow, and both were demonstrated rather than assumed:
 *
 *  - No static check over a string-spliced shader can be the last word. The
 *    same whitelist stayed green when `vY` and `vUpDir` had their declarations
 *    removed, while the live canvas rendered a single flat colour.
 *  - The screenshot harness would not have caught it either. Its gate is
 *    `draws > 100`, and WebGL still issues draw calls for a program that failed
 *    to compile. It photographed a black canvas and called it fine.
 *
 * So this asks a driver.
 *
 * HOW
 * ---
 * esbuild bundles the REAL project source for the browser — the same technique
 * `verify-plant3d.mjs` already uses to bundle it for Node — and headless Chrome
 * runs that bundle from a `blob:` URL. No dev server, no npm dependencies
 * beyond what is already here: Node 22 has a global `WebSocket`, which is the
 * whole of what the DevTools Protocol needs.
 *
 * `renderer.compile()` IS NOT ENOUGH, and this is the part that is easy to get
 * wrong: three collects `getShaderInfoLog`/`getProgramInfoLog` inside
 * `WebGLProgram.onFirstUse()`, which is wired to `getUniforms()`/
 * `getAttributes()` and does not run until a program is actually used to draw.
 * `compile()` links every program and reports nothing. A smoke test built on
 * `compile()` alone would have missed the original bug too. So this renders a
 * frame, then reads `LINK_STATUS` and the driver's own logs back.
 *
 * Exit codes — "compiled clean" and "could not look" must never share one:
 *   0  every material linked clean on a real driver
 *   1  at least one failed to compile or link
 *   2  the check could not run (no bundle, no browser, no WebGL2, no result)
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'client', 'src', 'lib', 'plant3d');
const PORT = 9377;
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findChrome = () => CHROMES.find((p) => existsSync(p)) ?? null;

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
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    });
  }

  send(method, params = {}, sessionId) {
    const id = (this.id += 1);
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((ok, bad) => {
      this.pending.set(id, { resolve: ok, reject: bad });
      setTimeout(() => {
        if (this.pending.delete(id)) bad(new Error(`${method} timed out`));
      }, 120_000);
    });
  }
}

async function evaluate(cdp, session, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}

/*
 * Runs inside the page. Builds one real instance of every material this app
 * ships, on real instanced geometry with the real `aColor`/`aFill`/`aFx`
 * attributes — the silo patch assumes instancing is active, so a plain Mesh
 * would compile a different program from the one that ships.
 */
const HARNESS = `
import * as THREE from 'three';
import { makeContentsMaterial, makeShellMaterial, makeSurfaceMaterial } from './siloShader.ts';
import { makeGroundMaterial } from './ground.tsx';
import { deriveDims } from './silos.ts';
import { siloProfile, segmentsFor } from './siloGeometry.ts';

function withInstanceAttrs(geo, count) {
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(0.6), 3));
  geo.setAttribute('aFill', new THREE.InstancedBufferAttribute(new Float32Array(count).fill(0.4), 1));
  geo.setAttribute('aFx', new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2));
  return geo;
}

async function run() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const gl = canvas.getContext('webgl2');
  if (!gl) return { fatal: 'no webgl2 context' };

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false });
  renderer.debug.checkShaderErrors = true;
  const scene = new THREE.Scene();
  scene.add(new THREE.DirectionalLight(0xffffff, 1));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 0, 0);

  const dims = deriveDims(160000, 4, 0.7, 2.5);
  const y0 = dims.elevation;
  const y1 = dims.elevation + dims.hopper + dims.barrel;
  const segs = segmentsFor(dims.diameter);
  const count = 3;
  const siloGeo = withInstanceAttrs(new THREE.LatheGeometry(siloProfile(dims), segs), count);
  const discGeo = withInstanceAttrs(new THREE.CircleGeometry(1, segs).rotateX(-Math.PI / 2), count);

  const entries = [];
  const addInstanced = (label, geometry, material, scale) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i += 1) {
      m.makeScale(scale, scale, scale);
      m.setPosition(i * 10, 0, 0);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    entries.push({ label, material });
  };

  addInstanced('silo contents', siloGeo, makeContentsMaterial('#4ade80', y0, y1, dims.hopper), 1);
  addInstanced('silo shell', siloGeo, makeShellMaterial('#4ade80', y0, y1, dims.hopper), 1);
  addInstanced('silo surface disc', discGeo, makeSurfaceMaterial(), 1);
  {
    const { material } = makeGroundMaterial();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(10, 10), material));
    entries.push({ label: 'ground', material });
  }

  let compileThrew = null;
  let renderThrew = null;
  try { renderer.compile(scene, camera); } catch (e) { compileThrew = String(e && e.stack || e); }
  /* The render is the point. compile() links but never asks the driver for a
     log, because three only does that on a program's first real USE. */
  try { renderer.render(scene, camera); } catch (e) { renderThrew = String(e && e.stack || e); }

  const report = [];
  for (const { label, material } of entries) {
    const props = renderer.properties.get(material);
    const programs = props && props.programs;
    if (!programs || programs.size === 0) {
      report.push({ label, ok: false, error: 'no compiled program after compile() and render()' });
      continue;
    }
    for (const [, programObj] of programs) {
      try { programObj.getUniforms(); } catch (e) { /* this is what triggers the log */ }
      const program = programObj.program;
      let vLog = '';
      let fLog = '';
      for (const sh of gl.getAttachedShaders(program) || []) {
        const log = (gl.getShaderInfoLog(sh) || '').trim();
        if (gl.getShaderParameter(sh, gl.SHADER_TYPE) === gl.VERTEX_SHADER) vLog = log;
        else fLog = log;
      }
      report.push({
        label,
        ok: gl.getProgramParameter(program, gl.LINK_STATUS) === true,
        programLog: (gl.getProgramInfoLog(program) || '').trim(),
        vertexLog: vLog,
        fragmentLog: fLog,
      });
    }
  }

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    compileThrew,
    renderThrew,
    report,
    driver: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  };
}

window.__glAudit = await run();
`;

async function main() {
  let bundle;
  try {
    const out = await build({
      stdin: { contents: HARNESS, resolveDir: SRC, loader: 'ts' },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      target: 'es2022',
      logLevel: 'error',
      external: [],
    });
    bundle = out.outputFiles[0].text;
  } catch (err) {
    console.error('COULD NOT RUN — the browser bundle failed to build.');
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
  }

  const chrome = findChrome();
  if (!chrome) {
    console.error('COULD NOT RUN — no Chrome or Edge on this machine.');
    process.exit(2);
  }

  const profile = join(tmpdir(), `plant3d-shaders-${process.pid}`);
  const child = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--mute-audio',
      /* three 0.169 asks for a webgl2 context and throws without one, so a
         plain --disable-gpu run compiles nothing at all. */
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const stderr = [];
  child.stderr.on('data', (d) => stderr.push(String(d)));

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
    if (!wsUrl) {
      console.error('COULD NOT RUN — the browser never opened a debug port.');
      console.error(stderr.join(''));
      process.exit(2);
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((ok, bad) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', () => bad(new Error('debug socket failed')), { once: true });
    });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, sessionId);

    let result;
    try {
      result = await evaluate(
        cdp,
        sessionId,
        `(async () => {
           const url = URL.createObjectURL(new Blob([${JSON.stringify(bundle)}], { type: 'text/javascript' }));
           await import(url);
           return window.__glAudit;
         })()`,
      );
    } catch (err) {
      console.error('COULD NOT RUN — the harness threw before producing a result.');
      console.error(err && err.stack ? err.stack : err);
      process.exit(2);
    }

    if (!result || result.fatal) {
      console.error(`COULD NOT RUN — ${result ? result.fatal : 'the page returned nothing'}`);
      process.exit(2);
    }

    console.log(`driver: ${result.driver}`);
    if (result.compileThrew) console.log(`renderer.compile() threw: ${result.compileThrew}`);
    if (result.renderThrew) console.log(`renderer.render() threw: ${result.renderThrew}`);

    let failed = 0;
    for (const r of result.report) {
      if (r.ok) {
        console.log(`ok    ${r.label}`);
        continue;
      }
      failed += 1;
      console.log(`FAIL  ${r.label}`);
      if (r.error) console.log(`      ${r.error}`);
      if (r.programLog) console.log(`      program: ${r.programLog}`);
      if (r.vertexLog) console.log(`      vertex: ${r.vertexLog}`);
      if (r.fragmentLog) console.log(`      fragment: ${r.fragmentLog}`);
    }

    /* Zero programs checked is a failure to look, not a clean result. */
    if (result.report.length === 0) {
      console.error('\nno programs were checked at all — treating that as could-not-run.');
      process.exit(2);
    }

    console.log(`\n${result.report.length} programs compiled on a real driver, ${failed} failed`);
    process.exit(failed ? 1 : 0);
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
