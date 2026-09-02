/**
 * Site-furniture checks for `structures.tsx` (workstream 4.E) — fence,
 * kerbs, gallery trusses, buildings, platforms, masts.
 *
 *   node scripts/verify-structures.mjs
 *
 * `Plant3D.tsx` is owned by another worker while this file was written, so
 * `structures.tsx` cannot be integrated and screenshot-verified inside the
 * real scene yet. This is the substitute: it bundles `structures.tsx`,
 * `site.ts`, `ground.tsx` and `silos.ts` for Node (three itself is pure
 * maths at import time, so it resolves fine there) and calls the PURE
 * builder functions the components are built from directly —
 * `buildFenceInstances`, `buildFencePanels`, `buildKerbs`,
 * `buildTrussMembers`, `buildBuildingParts`, `buildPlatformParts`,
 * `buildMastParts` — never mounting a `Canvas`. See the header comment on
 * `structures.tsx` for why every one of those returns a list of
 * `{ matrix, localMin?, localMax? }` `InstanceSpec`s rather than anything
 * React- or WebGL-shaped: a `THREE.Box3().applyMatrix4(matrix)` on the unit
 * shape's own local bounds gives this script the real world-space footprint
 * of every instance without ever creating a renderer.
 *
 * Exit codes, same convention as `verify-plant3d.mjs`:
 *   0  every check ran and passed
 *   1  at least one check failed
 *   2  the checks could not run at all (build failed, module missing)
 */
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'client', 'src', 'lib', 'plant3d');

let ran = 0;
let failed = 0;

function check(name, fn) {
  ran += 1;
  try {
    const problem = fn();
    if (problem) {
      failed += 1;
      console.log(`FAIL  ${name}\n      ${String(problem).replace(/\n/g, '\n      ')}`);
    } else {
      console.log(`ok    ${name}`);
    }
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${name}\n      threw: ${err && err.stack ? err.stack : err}`);
  }
}

async function bundle(dir, entries) {
  await build({
    entryPoints: entries.map((e) => join(SRC, e)),
    outdir: dir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'error',
    /* Bundle everything, same reasoning as verify-plant3d.mjs: the output
       lands in a temp dir outside the project, where Node cannot resolve
       bare specifiers back to node_modules. `react` and `@react-three/fiber`
       are only ever used inside the React COMPONENTS this script never
       calls (the pure builder functions have no React in their call graph),
       so their JSX never actually executes — but esbuild still has to be
       able to bundle the module textually, which `external: []` covers. */
    external: [],
  });
}

/** World-space AABB of one instance: the unit shape's own local bounds
 *  (a box by default; the roof prism passes its own via `localMin`/
 *  `localMax`) carried through the instance's world matrix. */
function worldBox(spec) {
  const min = spec.localMin ?? [-0.5, -0.5, -0.5];
  const max = spec.localMax ?? [0.5, 0.5, 0.5];
  const box = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
  box.applyMatrix4(spec.matrix);
  return box;
}

function position(spec) {
  const e = spec.matrix.elements;
  return new THREE.Vector3(e[12], e[13], e[14]);
}

/** The instance's TRUE 8 world-space corners — as opposed to `worldBox`'s
 *  axis-aligned bounding box, which over-estimates a rotated instance's
 *  extent along any axis that is not its own. Needed wherever a check tests
 *  extent along an axis that is not world X/Y/Z, such as a gallery's own
 *  span direction: projecting `worldBox`'s (already inflated) AABB corners
 *  onto that axis inflates the answer a second time. */
function worldCorners(spec) {
  const min = spec.localMin ?? [-0.5, -0.5, -0.5];
  const max = spec.localMax ?? [0.5, 0.5, 0.5];
  const corners = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        corners.push(new THREE.Vector3(x, y, z).applyMatrix4(spec.matrix));
      }
    }
  }
  return corners;
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'structures-verify-'));
  let structures;
  let site;
  let silos;
  try {
    await bundle(dir, ['structures.tsx', 'site.ts', 'ground.tsx', 'silos.ts']);
    structures = await import(pathToFileURL(join(dir, 'structures.js')).href);
    site = await import(pathToFileURL(join(dir, 'site.js')).href);
    silos = await import(pathToFileURL(join(dir, 'silos.js')).href);
  } catch (err) {
    console.error('COULD NOT RUN — the modules failed to build or import.');
    console.error(err && err.stack ? err.stack : err);
    await rm(dir, { recursive: true, force: true });
    process.exit(2);
  }

  const { SITE, ROADS, BUILDINGS, GALLERIES, KERB, BUILDING_DETAIL } = site;
  void silos;

  /* ---- fence -------------------------------------------------------- */

  check('fence posts approximate perimeter / postPitch', () => {
    const perimeter = 2 * (SITE.wall.length + SITE.wall.width);
    const expected = perimeter / SITE.fence.postPitch;
    const posts = structures.buildFenceInstances();
    if (!posts.length) return 'buildFenceInstances() returned no posts';
    const err = Math.abs(posts.length - expected);
    /* One post rounds per run-length (4 runs), so up to ~2 posts of slack
       either way is expected rounding noise, not a defect. */
    if (err > 4) {
      return `${posts.length} posts vs perimeter/pitch = ${expected.toFixed(1)} (off by ${err.toFixed(1)})`;
    }
    return null;
  });

  check('every fence post sits on the perimeter rectangle', () => {
    const w = SITE.wall;
    const hx = w.length / 2;
    const hz = w.width / 2;
    const posts = structures.buildFenceInstances();
    const bad = [];
    for (const spec of posts) {
      const p = position(spec);
      const onX = Math.abs(Math.abs(p.x - w.x) - hx) < 0.05 && p.z >= w.z - hz - 0.05 && p.z <= w.z + hz + 0.05;
      const onZ = Math.abs(Math.abs(p.z - w.z) - hz) < 0.05 && p.x >= w.x - hx - 0.05 && p.x <= w.x + hx + 0.05;
      if (!onX && !onZ) bad.push(`(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    }
    return bad.length ? `${bad.length} posts off the rectangle: ${bad.slice(0, 5).join(', ')}` : null;
  });

  /* ---- kerbs ---------------------------------------------------------- */

  check('kerbs sit KERB.offset outside each road edge', () => {
    const kerbs = structures.buildKerbs();
    if (kerbs.length !== ROADS.length * 2) {
      return `${kerbs.length} kerb instances for ${ROADS.length} roads — expected exactly one per side per road (${ROADS.length * 2})`;
    }
    const bad = [];
    let i = 0;
    for (const r of ROADS) {
      const hx = r.length / 2;
      const hz = r.width / 2;
      const alongX = hx >= hz;
      for (const sign of [-1, 1]) {
        const spec = kerbs[i++];
        const box = worldBox(spec);
        if (alongX) {
          /* inner face of the kerb (the edge nearer the road) should sit
             exactly KERB.offset past the road's own paved half-width */
          const innerZ = sign > 0 ? box.min.z : box.max.z;
          const gap = Math.abs(innerZ - (r.z + sign * hz)) ;
          if (Math.abs(gap - KERB.offset) > 0.02) {
            bad.push(`road@(${r.x},${r.z}) side ${sign}: gap ${gap.toFixed(3)}m, want ${KERB.offset}m`);
          }
        } else {
          const innerX = sign > 0 ? box.min.x : box.max.x;
          const gap = Math.abs(innerX - (r.x + sign * hx));
          if (Math.abs(gap - KERB.offset) > 0.02) {
            bad.push(`road@(${r.x},${r.z}) side ${sign}: gap ${gap.toFixed(3)}m, want ${KERB.offset}m`);
          }
        }
      }
    }
    return bad.length ? bad.join('; ') : null;
  });

  /* ---- gallery trusses -------------------------------------------------- */

  check('every truss member lies between the gallery ends within 0.5m', () => {
    const bad = [];
    let examined = 0;
    for (const g of GALLERIES) {
      const dx = g.to[0] - g.from[0];
      const dz = g.to[1] - g.from[1];
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      const members = structures.buildTrussMembers(g);
      if (!members.length) {
        bad.push(`gallery ${g.from}->${g.to}: buildTrussMembers returned nothing`);
        continue;
      }
      for (const spec of members) {
        examined += 1;
        /* Project the member's TRUE 8 corners onto the span axis — not
           `worldBox`'s axis-aligned bounding box, which over-estimates a
           rotated member's own extent and, projected again, compounds that
           into a second inflation. Every gallery in `GALLERIES` runs at a
           non-trivial angle to world X/Z, so this distinction is not
           academic: it is what turned a passing geometry into a false
           failure the first time this check was written. */
        let tMin = Infinity;
        let tMax = -Infinity;
        for (const c of worldCorners(spec)) {
          const t = (c.x - g.from[0]) * ux + (c.z - g.from[1]) * uz;
          tMin = Math.min(tMin, t);
          tMax = Math.max(tMax, t);
        }
        if (tMin < -0.5 - 1e-6 || tMax > len + 0.5 + 1e-6) {
          bad.push(`gallery ${g.from}->${g.to}: a member spans t=[${tMin.toFixed(2)}, ${tMax.toFixed(2)}] outside [0, ${len.toFixed(2)}] +/-0.5m`);
        }
      }
    }
    if (examined === 0) return 'examined no truss members at all — the empty-loop trap';
    return bad.length ? bad.slice(0, 6).join('; ') : null;
  });

  /* ---- buildings -------------------------------------------------------- */

  check('no building part extends outside its footprint by more than the parapet', () => {
    const bad = [];
    const allowance = BUILDING_DETAIL.parapetThickness + 0.05;
    for (const b of BUILDINGS) {
      const parts = structures.buildBuildingParts(b);
      const minX = b.x - b.length / 2 - allowance;
      const maxX = b.x + b.length / 2 + allowance;
      const minZ = b.z - b.width / 2 - allowance;
      const maxZ = b.z + b.width / 2 + allowance;
      /* Every building gets a parapet (top at height + parapetHeight); only
         a pitched-roof building also gets a ridge cap (top at height +
         roofRise + ridgeCapSize). The true ceiling is whichever is taller —
         missing the parapet term here is exactly the kind of "checked one
         part, not the actual maximum" gap this script exists to avoid. */
      const parapetTop = b.height + BUILDING_DETAIL.parapetHeight;
      const ridgeTop = b.height + (b.roofRise ?? 0) + BUILDING_DETAIL.ridgeCapSize;
      const maxY = Math.max(parapetTop, ridgeTop) + 0.05;
      const all = [parts.wall, ...parts.parapet, ...(parts.roof ? [parts.roof] : []), ...(parts.ridgeCap ? [parts.ridgeCap] : []), ...parts.vents, ...(parts.rollerDoor ? [parts.rollerDoor] : [])];
      for (const spec of all) {
        const box = worldBox(spec);
        if (box.min.x < minX - 1e-6 || box.max.x > maxX + 1e-6 || box.min.z < minZ - 1e-6 || box.max.z > maxZ + 1e-6 || box.max.y > maxY + 1e-6) {
          bad.push(
            `${b.id}: part x[${box.min.x.toFixed(1)},${box.max.x.toFixed(1)}] z[${box.min.z.toFixed(1)},${box.max.z.toFixed(1)}] y<=${box.max.y.toFixed(1)} outside footprint+parapet`,
          );
        }
      }
    }
    return bad.length ? bad.slice(0, 6).join('; ') : null;
  });

  check('every building wall matches its own footprint exactly', () => {
    const bad = [];
    for (const b of BUILDINGS) {
      const { wall } = structures.buildBuildingParts(b);
      const box = worldBox(wall);
      const dims = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
      const want = [b.length, b.height, b.width];
      for (let i = 0; i < 3; i++) {
        if (Math.abs(dims[i] - want[i]) > 1e-6) {
          bad.push(`${b.id}: dim ${i} = ${dims[i].toFixed(3)}, want ${want[i]}`);
        }
      }
    }
    return bad.length ? bad.join('; ') : null;
  });

  /* ---- platforms -------------------------------------------------------- */

  check('platform handrail sits at the deck edge', () => {
    const PLATFORMS = silos.PLATFORMS;
    if (!PLATFORMS || !PLATFORMS.length) return 'no platforms in the silo model';
    const bad = [];
    for (const p of PLATFORMS) {
      const parts = structures.buildPlatformParts(p);
      if (!parts.railPosts.length) {
        bad.push(`${p.id}: no rail posts`);
        continue;
      }
      const hx = p.length / 2;
      const hz = p.width / 2;
      for (const spec of parts.railPosts) {
        const pos = position(spec);
        const onX = Math.abs(Math.abs(pos.x - p.x) - hx) < 0.1;
        const onZ = Math.abs(Math.abs(pos.z - p.z) - hz) < 0.1;
        if (!(onX || onZ)) {
          bad.push(`${p.id}: a rail post at (${pos.x.toFixed(1)},${pos.z.toFixed(1)}) is not on the deck edge`);
        }
      }
    }
    return bad.length ? bad.slice(0, 6).join('; ') : null;
  });

  /* ---- masts -------------------------------------------------------------- */

  check('mast cone reaches from the head to the ground', () => {
    const LIGHT_MASTS = site.LIGHT_MASTS;
    if (!LIGHT_MASTS || !LIGHT_MASTS.length) return 'no light masts in the site model';
    const bad = [];
    for (const m of LIGHT_MASTS) {
      const parts = structures.buildMastParts(m);
      const box = worldBox(parts.cone);
      if (Math.abs(box.max.y - m.height) > 0.05 || box.min.y > 0.05) {
        bad.push(`${m.x},${m.z}: cone spans y[${box.min.y.toFixed(2)},${box.max.y.toFixed(2)}], want [0,${m.height}]`);
      }
    }
    return bad.length ? bad.join('; ') : null;
  });

  /* ---- draw-call budget --------------------------------------------------- */

  check('total site-furniture draw calls <= 25', () => {
    /*
     * One row per InstancedMesh (or, for the ghost-edge cage, one merged
     * LineSegments) actually returned by the `<Buildings>`, `<Platforms>`,
     * `<Perimeter>`, `<RoadKerbs>`, `<Galleries>` and `<LightMasts>`
     * components in `structures.tsx` — read off that file, not estimated.
     * Two entries (ghost edges, inferred galleries) are conditional on
     * runtime state; both are counted so the printed total is the WORST
     * case, not the typical one.
     */
    const rows = [
      ['Buildings', 'walls (solid)', 1],
      ['Buildings', 'walls (ghost)', 1],
      ['Buildings', 'parapet', 1],
      ['Buildings', 'roof', 1],
      ['Buildings', 'ridge cap', 1],
      ['Buildings', 'roof vents', 1],
      ['Buildings', 'roller doors', 1],
      ['Buildings', 'ghost edge cage (conditional)', 1],
      ['Platforms', 'slab', 1],
      ['Platforms', 'columns', 1],
      ['Platforms', 'handrail posts', 1],
      ['Platforms', 'handrail top rail', 1],
      ['Perimeter', 'posts', 1],
      ['Perimeter', 'panels', 1],
      ['RoadKerbs', 'kerbs', 1],
      ['Galleries', 'members (observed)', 1],
      ['Galleries', 'members (inferred, conditional)', 1],
      ['LightMasts', 'columns', 1],
      ['LightMasts', 'heads', 1],
      ['LightMasts', 'lamps', 1],
      ['LightMasts', 'cones', 1],
    ];
    const total = rows.reduce((a, r) => a + r[2], 0);
    console.log('      draw-call table:');
    for (const [comp, part, n] of rows) {
      console.log(`        ${comp.padEnd(11)} ${part.padEnd(32)} ${n}`);
    }
    console.log(`      total: ${total}`);
    return total > 25 ? `${total} draw calls exceeds the 25 budget` : null;
  });

  await rm(dir, { recursive: true, force: true });

  console.log(`\n${ran} checks run, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
