/**
 * Site furniture: buildings, platforms, the perimeter fence, road kerbs,
 * conveyor-gallery trusses and light masts (workstream 4.E of the visual
 * overhaul plan).
 *
 * Drop-in replacements for the structure components that used to live inline
 * in `Plant3D.tsx` (`Building` + `PitchedRoof`, `PlatformMesh`, `LightMasts`,
 * `Galleries`, `PerimeterWall`). Same public props as those, so the swap in
 * `Plant3D.tsx` is mechanical — see the integration note at the bottom of
 * this file's delivery report.
 *
 * NO BUILDING FOOTPRINT MOVES HERE. Every position, length, width and height
 * this file reads comes straight from `site.ts`'s `BUILDINGS`, `ROADS`,
 * `GALLERIES`, `LIGHT_MASTS` and `SITE`, none of which this file, or the
 * additive edits made to `site.ts` alongside it, changed a single coordinate
 * of. Only new *detail* parameters were added to `site.ts` (`SITE.fence`,
 * `KERB`, `BUILDING_DETAIL`, `TRUSS`).
 *
 * ---------------------------------------------------------------------------
 * Pure builders, then components
 * ---------------------------------------------------------------------------
 * Every repeated element (fence posts, kerb segments, truss members, mast
 * parts, roof vents, platform columns, building parapet/roof/vents/roller
 * doors) is produced by a PURE function — no React, no `useMemo`, nothing
 * that needs a mounted component — that returns a list of `InstanceSpec`s: a
 * world-space `THREE.Matrix4` plus, for the one shape that is not symmetric
 * about its own origin (the pitched-roof prism), the local bounds of the UNIT
 * geometry that matrix is meant to scale.
 *
 * That split is what lets `scripts/verify-structures.mjs` check this file's
 * geometry WITHOUT mounting a Canvas: it bundles this module for Node (three
 * itself is pure JS/maths with no WebGL dependency at import time) and calls
 * `buildFenceInstances()`, `buildKerbs()`, `buildTrussMembers(g)`,
 * `buildBuildingParts(b)`, `buildPlatformParts(p)`, `buildMastParts(m)`
 * directly, transforms each unit-geometry's local corners through the
 * returned matrix, and checks the resulting world bounds. The React
 * components below do nothing but call these same functions inside a
 * `useMemo` and hand the matrices to an `InstancedMesh`.
 */
/**
 * PROVENANCE — read before treating anything in this file as a plant fact.
 *
 * `BUILDINGS`, `ROADS`, `GALLERIES` and `LIGHT_MASTS` positions come from
 * `site.ts` (traced off aerial imagery, per that file's own header) and are
 * not touched here. Everything this file ADDS on top of them — ladders,
 * stairs, roof vents, kerbs, truss members, conveyor galleries' internal
 * bracing, the fence, handrails, mast light cones — is TYPICAL feed-mill
 * furniture drawn for legibility (so a building reads as a building and a
 * conveyor reads as a structure), not a surveyed or PLC-sourced fact about
 * this specific plant. None of it should be read off the model as data the
 * way a silo's fill level can be; the same line belongs in the UI's own
 * provenance note (§4.E delivery report), not only here.
 */
import { useEffect, useMemo, useRef, type DependencyList, type MutableRefObject } from 'react';
import * as THREE from 'three';
import {
  BUILDING_DETAIL,
  BUILDINGS,
  GALLERIES,
  KERB,
  LIGHT_MASTS,
  ROADS,
  SITE,
  TRUSS,
  ZONES,
  type Gallery,
  type SiteBuilding,
  type ZoneId,
} from './site';
import { PLATFORMS, SILOS, platformInZone, type Platform } from './silos';

/* ------------------------------------------------------------------ */
/* Shared instance-matrix maths                                        */
/* ------------------------------------------------------------------ */

/**
 * One instance: a world-space transform for a UNIT shape. `localMin`/
 * `localMax` describe that unit shape's own bounds and default to a box
 * centred on its own origin (`[-0.5,-0.5,-0.5]` to `[0.5,0.5,0.5]`) — every
 * shape here is that box EXCEPT the roof prism, whose apex sits above its own
 * base rather than straddling it (`y` from `0` to `1`).
 */
export interface InstanceSpec {
  matrix: THREE.Matrix4;
  localMin?: [number, number, number];
  localMax?: [number, number, number];
  /** per-instance colour tint — only the building-wall instances use this. */
  color?: string;
}

const BOX_MIN: [number, number, number] = [-0.5, -0.5, -0.5];
const BOX_MAX: [number, number, number] = [0.5, 0.5, 0.5];
const PRISM_MIN: [number, number, number] = [-0.5, 0, -0.5];
const PRISM_MAX: [number, number, number] = [0.5, 1, 0.5];

/* A single reused dummy object rather than allocating one per instance —
   `.matrix.clone()` is taken immediately after `updateMatrix()`, so nothing
   downstream ever observes it being mutated again. Same pattern three's own
   InstancedMesh examples use. */
const _dummy = new THREE.Object3D();

/** Composes a world matrix from position/Euler/scale. Euler is safe here
 *  even though three's default order is not purely rotation-order-agnostic,
 *  because every caller that uses it passes a SINGLE non-zero axis (Y) — a
 *  rotation about one axis is order-independent regardless of convention. */
function composeMatrix(
  position: readonly [number, number, number],
  rotation: readonly [number, number, number],
  scale: readonly [number, number, number],
): THREE.Matrix4 {
  _dummy.position.set(position[0], position[1], position[2]);
  _dummy.rotation.set(rotation[0], rotation[1], rotation[2]);
  _dummy.scale.set(scale[0], scale[1], scale[2]);
  _dummy.updateMatrix();
  return _dummy.matrix.clone();
}

/**
 * Orients a unit box's local +X axis along the segment `a` -> `b` and scales
 * it to the segment's length, `crossW` and `crossH` across it. Used for the
 * truss diagonals, the one member whose two ends sit at different heights, so
 * a plain Y-only rotation cannot describe it — this is the standard
 * "stretch a box between two points" construction (`setFromUnitVectors`) and
 * is unambiguous regardless of Euler convention because it never uses one.
 */
function segmentMatrix(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  crossW: number,
  crossH: number,
): THREE.Matrix4 {
  const va = new THREE.Vector3(a[0], a[1], a[2]);
  const vb = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  _dummy.position.copy(mid);
  _dummy.quaternion.copy(q);
  _dummy.scale.set(len, crossH, crossW);
  _dummy.updateMatrix();
  return _dummy.matrix.clone();
}

/**
 * A point at `(lx, ly, lz)` in a gallery's own local frame — `lx` along the
 * span, `ly` an ABSOLUTE world height (never rotated), `lz` lateral —
 * rotated by `angle` around Y and translated to `(mx, mz)`. Pure trig rather
 * than a matrix round-trip, because several callers need the plain
 * `[number, number, number]` to feed into `segmentMatrix` above.
 */
function toWorld(
  mx: number,
  mz: number,
  angle: number,
  lx: number,
  ly: number,
  lz: number,
): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [mx + lx * c - lz * s, ly, mz + lx * s + lz * c];
}

/* ------------------------------------------------------------------ */
/* Fence (§4.E.3)                                                      */
/* ------------------------------------------------------------------ */

export interface FencePost {
  matrix: THREE.Matrix4;
}

/** Posts every `SITE.fence.postPitch` metres around `SITE.wall`'s rectangle —
 *  the fence LINE, unchanged. Pure. */
export function buildFenceInstances(): InstanceSpec[] {
  const w = SITE.wall;
  const { postPitch, height, postSize } = SITE.fence;
  const hx = w.length / 2;
  const hz = w.width / 2;
  const corners: [number, number][] = [
    [w.x - hx, w.z - hz],
    [w.x + hx, w.z - hz],
    [w.x + hx, w.z + hz],
    [w.x - hx, w.z + hz],
  ];
  const out: InstanceSpec[] = [];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corners[i];
    const [x1, z1] = corners[(i + 1) % 4];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(len / postPitch));
    const ux = dx / len;
    const uz = dz / len;
    /* One post every pitch along the run, corner post included once (as the
       start of the run whose corner it is), so runs never double up a post
       at a shared corner. */
    for (let k = 0; k < n; k++) {
      const t = k * (len / n);
      out.push({
        matrix: composeMatrix([x0 + ux * t, height / 2, z0 + uz * t], [0, 0, 0], [postSize, height, postSize]),
      });
    }
  }
  return out;
}

/** The four translucent panel strips, one per side of the fence rectangle. */
export function buildFencePanels(): InstanceSpec[] {
  const w = SITE.wall;
  const { panelHeight } = SITE.fence;
  const hx = w.length / 2;
  const hz = w.width / 2;
  const runs: [number, number, number, number][] = [
    [w.x - hx, w.z - hz, w.x + hx, w.z - hz],
    [w.x + hx, w.z - hz, w.x + hx, w.z + hz],
    [w.x + hx, w.z + hz, w.x - hx, w.z + hz],
    [w.x - hx, w.z + hz, w.x - hx, w.z - hz],
  ];
  return runs.map(([x0, z0, x1, z1]) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    return {
      matrix: composeMatrix(
        [(x0 + x1) / 2, panelHeight / 2, (z0 + z1) / 2],
        [0, angle, 0],
        [len, panelHeight, 0.02],
      ),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Road kerbs (§4.E.2)                                                 */
/* ------------------------------------------------------------------ */

/** One kerb box per side per road in `ROADS` — `KERB.offset` outside that
 *  road's own paved half-width, on whichever axis the road runs along. */
export function buildKerbs(): InstanceSpec[] {
  const out: InstanceSpec[] = [];
  for (const r of ROADS) {
    const hx = r.length / 2;
    const hz = r.width / 2;
    /* Matches the ground shader's own `alongX = step(h.y, h.x)` rule in
       ground.tsx: a road whose X half-extent is the larger one runs along X. */
    const alongX = hx >= hz;
    const off = KERB.offset + KERB.width / 2;
    if (alongX) {
      for (const sign of [-1, 1] as const) {
        out.push({
          matrix: composeMatrix([r.x, KERB.height / 2, r.z + sign * (hz + off)], [0, 0, 0], [r.length, KERB.height, KERB.width]),
        });
      }
    } else {
      for (const sign of [-1, 1] as const) {
        out.push({
          matrix: composeMatrix([r.x + sign * (hx + off), KERB.height / 2, r.z], [0, 0, 0], [KERB.width, KERB.height, r.width]),
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Conveyor-gallery trusses (§4.E.6)                                   */
/* ------------------------------------------------------------------ */

/**
 * Zone-relevance test for a gallery, moved here from `Plant3D.tsx` so it can
 * be imported without pulling in the rest of that file. See the original's
 * own note (kept in spirit): a gallery is a CONNECTOR between two areas, not
 * a resident of one zone, so it counts as relevant whenever either end falls
 * near that zone's own silo footprint.
 */
const GALLERY_ZONE_MARGIN = 12;

export const ZONE_FOOTPRINT: Record<ZoneId, { minX: number; maxX: number; minZ: number; maxZ: number }> = (() => {
  const out = {} as Record<ZoneId, { minX: number; maxX: number; minZ: number; maxZ: number }>;
  for (const z of ZONES) {
    const ps = SILOS.filter((s) => s.group.zone === z.id);
    if (!ps.length) {
      out[z.id] = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
      continue;
    }
    out[z.id] = {
      minX: Math.min(...ps.map((p) => p.x)),
      maxX: Math.max(...ps.map((p) => p.x)),
      minZ: Math.min(...ps.map((p) => p.z)),
      maxZ: Math.max(...ps.map((p) => p.z)),
    };
  }
  return out;
})();

export function galleryTouchesZone(g: Gallery, zoneId: ZoneId): boolean {
  const fp = ZONE_FOOTPRINT[zoneId];
  const near = (x: number, z: number) =>
    x >= fp.minX - GALLERY_ZONE_MARGIN &&
    x <= fp.maxX + GALLERY_ZONE_MARGIN &&
    z >= fp.minZ - GALLERY_ZONE_MARGIN &&
    z <= fp.maxZ + GALLERY_ZONE_MARGIN;
  return near(g.from[0], g.from[1]) || near(g.to[0], g.to[1]);
}

/**
 * One gallery's members: two chords (at `g.y` and `g.y + g.width`), a thin
 * deck plane at the top, verticals every `TRUSS.verticalSpacing` along the
 * span, zig-zag diagonals between them, and the support legs down to the
 * ground (kept from the previous `Galleries` component's own leg placement).
 * All in a single vertical plane containing the span — a real lattice truss
 * has chords on both sides, but this is the right level of fidelity for a
 * background structure seen mostly in silhouette, and it keeps every member
 * a plain box (or a box stretched along a segment for the diagonals) sharing
 * one InstancedMesh with every other gallery of the same `observed` state.
 */
export function buildTrussMembers(g: Gallery): InstanceSpec[] {
  const dx = g.to[0] - g.from[0];
  const dz = g.to[1] - g.from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const mx = (g.from[0] + g.to[0]) / 2;
  const mz = (g.from[1] + g.to[1]) / 2;
  const s = TRUSS.memberSize;
  const yBot = g.y;
  const yTop = g.y + g.width;
  const out: InstanceSpec[] = [];

  /* chords */
  out.push({ matrix: composeMatrix(toWorld(mx, mz, angle, 0, yBot, 0), [0, angle, 0], [len, s, s]) });
  out.push({ matrix: composeMatrix(toWorld(mx, mz, angle, 0, yTop, 0), [0, angle, 0], [len, s, s]) });

  /* deck: a thin walkway sitting on the top chord */
  out.push({
    matrix: composeMatrix(
      toWorld(mx, mz, angle, 0, yTop + s / 2 + TRUSS.deckThickness / 2, 0),
      [0, angle, 0],
      [len, TRUSS.deckThickness, g.width],
    ),
  });

  /* verticals, both ends included */
  const nV = Math.max(2, Math.round(len / TRUSS.verticalSpacing) + 1);
  const spanPositions: number[] = [];
  for (let i = 0; i < nV; i++) {
    const t = (i / (nV - 1) - 0.5) * len;
    spanPositions.push(t);
    out.push({
      matrix: composeMatrix(toWorld(mx, mz, angle, t, (yBot + yTop) / 2, 0), [0, angle, 0], [s, yTop - yBot, s]),
    });
  }

  /* diagonals: zig-zag between consecutive verticals */
  for (let i = 0; i < spanPositions.length - 1; i++) {
    const y0 = i % 2 === 0 ? yBot : yTop;
    const y1 = i % 2 === 0 ? yTop : yBot;
    const a = toWorld(mx, mz, angle, spanPositions[i], y0, 0);
    const b = toWorld(mx, mz, angle, spanPositions[i + 1], y1, 0);
    out.push({ matrix: segmentMatrix(a, b, s, s) });
  }

  /* legs, as the previous `Galleries` component placed them: evenly spaced,
     inset 8% from each end so a leg never lands exactly under a support. */
  const legCount = Math.max(2, Math.round(len / 14));
  for (let k = 0; k < legCount; k++) {
    const t = legCount === 1 ? 0 : (k / (legCount - 1) - 0.5) * len * 0.92;
    out.push({ matrix: composeMatrix(toWorld(mx, mz, angle, t, g.y / 2, 0), [0, angle, 0], [0.45, g.y, 0.45]) });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Buildings (§4.E.4, §4.E.5)                                          */
/* ------------------------------------------------------------------ */

const CLADDING_COLOR = '#cfd3d6';
const ROOF_COLOR = '#b7bcc1';
const OFFICE_COLOR = '#d8d4cc';
const ROLLER_DOOR_COLOR = '#5b6169';
/* Same reasoning `GHOST_EDGE`/`GHOST_FILL` used in the old `Plant3D.tsx`
   `Building`: dim and cool, so a see-through building recedes into the mid
   greys and says "there is a room here" without becoming the brightest thing
   in the frame. */
export const GHOST_FILL = '#63707f';
export const GHOST_EDGE = '#9aa4ad';

export interface BuildingParts {
  wall: InstanceSpec;
  parapet: InstanceSpec[];
  roof: InstanceSpec | null;
  ridgeCap: InstanceSpec | null;
  vents: InstanceSpec[];
  rollerDoor: InstanceSpec | null;
}

/**
 * Every part of one building, at its real footprint — walls, a parapet frame
 * at the eaves, the pitched roof (as a UNIT triangular prism scaled by
 * `[b.length, b.roofRise, b.width]`, which reproduces exactly the shape the
 * old per-building `ExtrudeGeometry` built, see the delivery notes), a ridge
 * cap, roof vents and a roller door on the yard (+Z) face. Pure — ghosting is
 * a RENDER-time decision the `Buildings` component makes about which of
 * these parts to draw, not something this function knows about.
 */
export function buildBuildingParts(b: SiteBuilding): BuildingParts {
  const d = BUILDING_DETAIL;
  const rise = b.roofRise ?? 0;
  const hasRoof = rise > 0;
  const color = b.kind === 'office' ? OFFICE_COLOR : CLADDING_COLOR;

  const wall: InstanceSpec = {
    matrix: composeMatrix([b.x, b.height / 2, b.z], [0, 0, 0], [b.length, b.height, b.width]),
    color,
  };

  /* Parapet: a thin frame of four boxes wrapping the eaves, inset half the
     frame's own thickness so it sits ON the wall line rather than floating
     past it. */
  const pt = d.parapetThickness;
  const py = b.height + d.parapetHeight / 2;
  const parapet: InstanceSpec[] = [
    { matrix: composeMatrix([b.x, py, b.z - b.width / 2 + pt / 2], [0, 0, 0], [b.length, d.parapetHeight, pt]) },
    { matrix: composeMatrix([b.x, py, b.z + b.width / 2 - pt / 2], [0, 0, 0], [b.length, d.parapetHeight, pt]) },
    { matrix: composeMatrix([b.x - b.length / 2 + pt / 2, py, b.z], [0, 0, 0], [pt, d.parapetHeight, b.width]) },
    { matrix: composeMatrix([b.x + b.length / 2 - pt / 2, py, b.z], [0, 0, 0], [pt, d.parapetHeight, b.width]) },
  ];

  let roof: InstanceSpec | null = null;
  let ridgeCap: InstanceSpec | null = null;
  const vents: InstanceSpec[] = [];
  let rollerDoor: InstanceSpec | null = null;

  if (hasRoof) {
    roof = {
      matrix: composeMatrix([b.x, b.height, b.z], [0, 0, 0], [b.length, rise, b.width]),
      localMin: PRISM_MIN,
      localMax: PRISM_MAX,
    };
    ridgeCap = {
      matrix: composeMatrix([b.x, b.height + rise + d.ridgeCapSize / 2, b.z], [0, 0, 0], [b.length, d.ridgeCapSize, d.ridgeCapSize]),
    };
    /* Four vents along the ridge line, evenly spaced with a margin from each
       gable end so none of them sit flush with a wall. */
    const n = d.ventsPerBuilding;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      vents.push({
        matrix: composeMatrix(
          [b.x + t * b.length * 0.8, b.height + rise * 0.5 + d.ventSize / 2, b.z],
          [0, 0, 0],
          [d.ventSize, d.ventSize, d.ventSize],
        ),
      });
    }
    /* Roller door on the +Z (yard) face — a slightly darker inset box, its
       outer face flush with the wall so it reads as a door in the wall
       rather than a box stuck to it. */
    rollerDoor = {
      matrix: composeMatrix(
        [b.x, d.rollerDoorHeight / 2, b.z + b.width / 2 - 0.1],
        [0, 0, 0],
        [d.rollerDoorWidth, d.rollerDoorHeight, 0.2],
      ),
    };
  }

  return { wall, parapet, roof, ridgeCap, vents, rollerDoor };
}

/* ------------------------------------------------------------------ */
/* Platforms (mezzanines under elevated bins)                          */
/* ------------------------------------------------------------------ */

const RAIL = { height: 1.1, postPitch: 2, postSize: 0.06, railSize: 0.05 };

export interface PlatformParts {
  slab: InstanceSpec;
  columns: InstanceSpec[];
  railPosts: InstanceSpec[];
  railTop: InstanceSpec[];
}

export function buildPlatformParts(p: Platform): PlatformParts {
  const slab: InstanceSpec = {
    matrix: composeMatrix([p.x, p.y - 0.2, p.z], [0, 0, 0], [p.length, 0.4, p.width]),
  };

  const colXZ: [number, number][] = [
    [p.x - p.length / 2 + 1, p.z - p.width / 2 + 1],
    [p.x + p.length / 2 - 1, p.z - p.width / 2 + 1],
    [p.x - p.length / 2 + 1, p.z + p.width / 2 - 1],
    [p.x + p.length / 2 - 1, p.z + p.width / 2 - 1],
    [p.x, p.z - p.width / 2 + 1],
    [p.x, p.z + p.width / 2 - 1],
  ];
  const columns: InstanceSpec[] = colXZ.map(([cx, cz]) => ({
    matrix: composeMatrix([cx, (p.y - 0.4) / 2, cz], [0, 0, 0], [0.45, p.y - 0.4, 0.45]),
  }));

  /* Handrail around the deck edge: posts every `RAIL.postPitch` metres on
     each side, plus a top rail running each side's full length. */
  const railY = p.y + RAIL.height / 2;
  const hx = p.length / 2;
  const hz = p.width / 2;
  const sides: [number, number, number, number][] = [
    [p.x - hx, p.z - hz, p.x + hx, p.z - hz],
    [p.x + hx, p.z - hz, p.x + hx, p.z + hz],
    [p.x + hx, p.z + hz, p.x - hx, p.z + hz],
    [p.x - hx, p.z + hz, p.x - hx, p.z - hz],
  ];
  const railPosts: InstanceSpec[] = [];
  const railTop: InstanceSpec[] = [];
  for (const [x0, z0, x1, z1] of sides) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const n = Math.max(1, Math.round(len / RAIL.postPitch));
    const ux = dx / len;
    const uz = dz / len;
    for (let k = 0; k <= n; k++) {
      const t = k * (len / n);
      railPosts.push({
        matrix: composeMatrix([x0 + ux * t, railY, z0 + uz * t], [0, 0, 0], [RAIL.postSize, RAIL.height, RAIL.postSize]),
      });
    }
    railTop.push({
      matrix: composeMatrix(
        [(x0 + x1) / 2, p.y + RAIL.height, (z0 + z1) / 2],
        [0, angle, 0],
        [len, RAIL.railSize, RAIL.railSize],
      ),
    });
  }

  return { slab, columns, railPosts, railTop };
}

/* ------------------------------------------------------------------ */
/* Light masts                                                         */
/* ------------------------------------------------------------------ */

const MAST_CONE_RADIUS = 4;

export interface MastParts {
  column: InstanceSpec;
  head: InstanceSpec;
  lamp: InstanceSpec;
  cone: InstanceSpec;
}

export function buildMastParts(m: { x: number; z: number; height: number }): MastParts {
  return {
    column: { matrix: composeMatrix([m.x, m.height / 2, m.z], [0, 0, 0], [0.42, m.height, 0.42]) },
    head: { matrix: composeMatrix([m.x, m.height + 0.75, m.z], [0, 0, 0], [1.5, 0.5, 1.5]) },
    lamp: { matrix: composeMatrix([m.x, m.height + 0.42, m.z], [0, 0, 0], [0.95, 0.16, 0.95]) },
    /* Unit cone geometry (built in the component below) has its apex at
       local y=0 and flares down to y=-1, radius 1 at the base — scaling by
       `[MAST_CONE_RADIUS, m.height, MAST_CONE_RADIUS]` and positioning the
       apex at the lamp head puts the cone's base at the ground. */
    cone: {
      matrix: composeMatrix([m.x, m.height, m.z], [0, 0, 0], [MAST_CONE_RADIUS, m.height, MAST_CONE_RADIUS]),
      /* The unit cone geometry the `LightMasts` component builds has its
         apex at local y=0 and flares DOWN to y=-1 (radius 1 at the base) —
         see its own `coneGeo` note — not the box-default [-0.5,0.5]. */
      localMin: [-1, -1, -1],
      localMax: [1, 0, 1],
    },
  };
}

/* ------------------------------------------------------------------ */
/* React: shared instancing helper                                     */
/* ------------------------------------------------------------------ */

/** Applies world matrices (and, if given, per-instance colours) to an
 *  InstancedMesh once. Site furniture is static — nothing here moves after
 *  layout — so there is no per-frame update, unlike `siloMesh.tsx`. */
function useApplyInstances(
  ref: MutableRefObject<THREE.InstancedMesh | null>,
  specs: InstanceSpec[],
  deps: DependencyList,
) {
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let hasColor = false;
    specs.forEach((spec, i) => {
      mesh.setMatrixAt(i, spec.matrix);
      if (spec.color) hasColor = true;
    });
    if (hasColor) {
      specs.forEach((spec, i) => {
        mesh.setColorAt(i, new THREE.Color(spec.color ?? '#ffffff'));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ------------------------------------------------------------------ */
/* <Buildings>                                                         */
/* ------------------------------------------------------------------ */

export interface BuildingsProps {
  zone: ZoneId | 'all';
  ghosted: boolean;
}

/**
 * Replaces `Building` + `PitchedRoof`. Same ghosting rule as before: a
 * building with a `zone` goes see-through when the global toggle is on OR
 * its own zone is the one framed; the office (no `zone`) never ghosts, since
 * nothing is ever drawn inside it.
 */
export function Buildings({ zone, ghosted }: BuildingsProps) {
  const shown = BUILDINGS.filter((b) => zone === 'all' || !b.zone || b.zone === zone);
  const ghostedIds = shown.filter((b) => !!b.zone && (ghosted || (zone !== 'all' && b.zone === zone))).map((b) => b.id);
  const solid = shown.filter((b) => !ghostedIds.includes(b.id));

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const prismGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-0.5, 0, 0);
    geo.computeVertexNormals();
    return geo;
  }, []);

  const wallMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.04 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uStripePitch = { value: BUILDING_DETAIL.claddingStripePitch };
      shader.uniforms.uStripeLum = { value: BUILDING_DETAIL.claddingStripeLuminance };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vWallX;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallX = ( modelMatrix * vec4( transformed, 1.0 ) ).x;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vWallX;\nuniform float uStripePitch;\nuniform float uStripeLum;')
        /* Appended AFTER the stock chunk, not replacing it: three's own
           `color_fragment` is what multiplies `diffuseColor` by the
           per-instance `instanceColor` (office vs cladding tint), and this
           needs that to have already happened. */
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n' +
            'float rib = step( 0.5, fract( vWallX / uStripePitch ) );\n' +
            'diffuseColor.rgb *= mix( 1.0 - uStripeLum, 1.0 + uStripeLum, rib );',
        );
    };
    mat.customProgramCacheKey = () => 'fakieh-building-wall-1';
    return mat;
  }, []);

  const ghostMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: GHOST_FILL,
        roughness: 0.9,
        metalness: 0.04,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    [],
  );
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.85, metalness: 0.05 }), []);
  const parapetMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.88, metalness: 0.04 }), []);
  const ventMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9aa1a7', roughness: 0.7, metalness: 0.2 }), []);
  const doorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ROLLER_DOOR_COLOR, roughness: 0.7, metalness: 0.15 }), []);

  useEffect(
    () => () => {
      boxGeo.dispose();
      prismGeo.dispose();
      wallMat.dispose();
      ghostMat.dispose();
      roofMat.dispose();
      parapetMat.dispose();
      ventMat.dispose();
      doorMat.dispose();
    },
    [boxGeo, prismGeo, wallMat, ghostMat, roofMat, parapetMat, ventMat, doorMat],
  );

  const parts = useMemo(() => BUILDINGS.map((b) => ({ id: b.id, parts: buildBuildingParts(b) })), []);
  const byId = new Map(parts.map((x) => [x.id, x.parts]));

  /* Fixed slot count of `BUILDINGS.length` for every instanced set below —
     an unused slot (a building not in `shown`, or on the "wrong" side of the
     solid/ghost split) is zero-scaled rather than omitted, so the instance
     COUNT never changes across renders and the mesh never has to remount. */
  const zeroSpec: InstanceSpec = { matrix: composeMatrix([0, -9999, 0], [0, 0, 0], [0, 0, 0]) };

  const wallSolidSpecs = BUILDINGS.map((b) => (solid.includes(b) ? byId.get(b.id)!.wall : zeroSpec));
  const wallGhostSpecs = BUILDINGS.map((b) => (ghostedIds.includes(b.id) ? byId.get(b.id)!.wall : zeroSpec));
  const parapetSpecs = BUILDINGS.flatMap((b) => (solid.includes(b) ? byId.get(b.id)!.parapet : [zeroSpec, zeroSpec, zeroSpec, zeroSpec]));
  const roofBuildings = BUILDINGS.filter((b) => (b.roofRise ?? 0) > 0);
  const roofSpecs = roofBuildings.map((b) => (solid.includes(b) ? byId.get(b.id)!.roof! : zeroSpec));
  const ridgeSpecs = roofBuildings.map((b) => (solid.includes(b) ? byId.get(b.id)!.ridgeCap! : zeroSpec));
  const ventSpecs = roofBuildings.flatMap((b) =>
    solid.includes(b) ? byId.get(b.id)!.vents : Array.from({ length: BUILDING_DETAIL.ventsPerBuilding }, () => zeroSpec),
  );
  const doorSpecs = roofBuildings.map((b) => (solid.includes(b) ? byId.get(b.id)!.rollerDoor! : zeroSpec));

  const wallSolidRef = useRef<THREE.InstancedMesh>(null);
  const wallGhostRef = useRef<THREE.InstancedMesh>(null);
  const parapetRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const ridgeRef = useRef<THREE.InstancedMesh>(null);
  const ventRef = useRef<THREE.InstancedMesh>(null);
  const doorRef = useRef<THREE.InstancedMesh>(null);

  const key = `${zone}:${ghosted}`;
  useApplyInstances(wallSolidRef, wallSolidSpecs, [key]);
  useApplyInstances(wallGhostRef, wallGhostSpecs, [key]);
  useApplyInstances(parapetRef, parapetSpecs, [key]);
  useApplyInstances(roofRef, roofSpecs, [key]);
  useApplyInstances(ridgeRef, ridgeSpecs, [key]);
  useApplyInstances(ventRef, ventSpecs, [key]);
  useApplyInstances(doorRef, doorSpecs, [key]);

  /* Ghost edge cage: one merged LineSegments geometry over every currently
     ghosted building, rebuilt only when the ghosted set changes — a single
     draw call regardless of how many buildings are ghosted, instead of one
     `<Edges>` per building. */
  const edgeGeometry = useMemo(() => {
    if (!ghostedIds.length) return null;
    const merged = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (const id of ghostedIds) {
      const b = BUILDINGS.find((x) => x.id === id)!;
      const box = new THREE.BoxGeometry(b.length, b.height, b.width);
      const edges = new THREE.EdgesGeometry(box, 15);
      const pos = edges.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i) + b.x, pos.getY(i) + b.height / 2, pos.getZ(i) + b.z);
      }
      box.dispose();
      edges.dispose();
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostedIds.join(',')]);
  useEffect(() => () => edgeGeometry?.dispose(), [edgeGeometry]);
  const edgeMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: GHOST_EDGE, transparent: true, opacity: 0.25 }),
    [],
  );
  useEffect(() => () => edgeMat.dispose(), [edgeMat]);

  return (
    <group>
      <instancedMesh name="structure:building-wall-solid" ref={wallSolidRef} args={[boxGeo, wallMat, BUILDINGS.length]} castShadow receiveShadow />
      <instancedMesh name="structure:building-wall-ghost" ref={wallGhostRef} args={[boxGeo, ghostMat, BUILDINGS.length]} />
      <instancedMesh name="structure:building-parapet" ref={parapetRef} args={[boxGeo, parapetMat, BUILDINGS.length * 4]} castShadow receiveShadow />
      {roofBuildings.length > 0 && (
        <>
          <instancedMesh name="structure:building-roof" ref={roofRef} args={[prismGeo, roofMat, roofBuildings.length]} castShadow receiveShadow />
          <instancedMesh name="structure:building-ridge-cap" ref={ridgeRef} args={[boxGeo, roofMat, roofBuildings.length]} castShadow />
          <instancedMesh
            name="structure:building-roof-vent"
            ref={ventRef}
            args={[boxGeo, ventMat, roofBuildings.length * BUILDING_DETAIL.ventsPerBuilding]}
            castShadow
          />
          <instancedMesh name="structure:building-roller-door" ref={doorRef} args={[boxGeo, doorMat, roofBuildings.length]} />
        </>
      )}
      {edgeGeometry && <lineSegments name="structure:building-ghost-edges" geometry={edgeGeometry} material={edgeMat} />}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* <Platforms>                                                         */
/* ------------------------------------------------------------------ */

export function Platforms({ zone }: { zone: ZoneId | 'all' }) {
  /* Building-aware, like the silo groups: the mineral floor stands in mill-a
     (raw) and serves the dosing zone, so both views must draw it. */
  const shown = PLATFORMS.filter((p) => platformInZone(p, zone, BUILDINGS));

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const slabMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9aa2aa', roughness: 0.85, metalness: 0.15 }), []);
  const colMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#868e96', roughness: 0.85, metalness: 0.2 }), []);
  const railMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7d858d', roughness: 0.7, metalness: 0.3 }), []);
  useEffect(
    () => () => {
      boxGeo.dispose();
      slabMat.dispose();
      colMat.dispose();
      railMat.dispose();
    },
    [boxGeo, slabMat, colMat, railMat],
  );

  const built = useMemo(() => PLATFORMS.map((p) => ({ id: p.id, parts: buildPlatformParts(p) })), []);
  const byId = new Map(built.map((x) => [x.id, x.parts]));
  const zeroSpec: InstanceSpec = { matrix: composeMatrix([0, -9999, 0], [0, 0, 0], [0, 0, 0]) };

  const slabSpecs = PLATFORMS.map((p) => (shown.includes(p) ? byId.get(p.id)!.slab : zeroSpec));
  const colSpecs = PLATFORMS.flatMap((p) => (shown.includes(p) ? byId.get(p.id)!.columns : Array.from({ length: 6 }, () => zeroSpec)));
  const railPostCounts = built.map((x) => x.parts.railPosts.length);
  const maxRailPosts = Math.max(1, ...railPostCounts);
  const railPostSpecs = PLATFORMS.flatMap((p) => {
    const posts = byId.get(p.id)!.railPosts;
    const padded = shown.includes(p) ? posts : [];
    return Array.from({ length: maxRailPosts }, (_, i) => padded[i] ?? zeroSpec);
  });
  const railTopSpecs = PLATFORMS.flatMap((p) => (shown.includes(p) ? byId.get(p.id)!.railTop : [zeroSpec, zeroSpec, zeroSpec, zeroSpec]));

  const slabRef = useRef<THREE.InstancedMesh>(null);
  const colRef = useRef<THREE.InstancedMesh>(null);
  const railPostRef = useRef<THREE.InstancedMesh>(null);
  const railTopRef = useRef<THREE.InstancedMesh>(null);

  const key = zone;
  useApplyInstances(slabRef, slabSpecs, [key]);
  useApplyInstances(colRef, colSpecs, [key]);
  useApplyInstances(railPostRef, railPostSpecs, [key]);
  useApplyInstances(railTopRef, railTopSpecs, [key]);

  if (!PLATFORMS.length) return null;
  return (
    <group>
      <instancedMesh name="structure:platform-slab" ref={slabRef} args={[boxGeo, slabMat, PLATFORMS.length]} castShadow receiveShadow />
      <instancedMesh name="structure:platform-column" ref={colRef} args={[boxGeo, colMat, PLATFORMS.length * 6]} castShadow receiveShadow />
      <instancedMesh name="structure:platform-rail-post" ref={railPostRef} args={[boxGeo, railMat, PLATFORMS.length * maxRailPosts]} castShadow />
      <instancedMesh name="structure:platform-rail-top" ref={railTopRef} args={[boxGeo, railMat, PLATFORMS.length * 4]} castShadow />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* <Perimeter> (the fence)                                             */
/* ------------------------------------------------------------------ */

export function Perimeter({ color }: { color: string }) {
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const postMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.4 }), [color]);
  const panelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.05,
        transparent: true,
        opacity: SITE.fence.panelAlpha,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [color],
  );
  useEffect(
    () => () => {
      boxGeo.dispose();
      postMat.dispose();
      panelMat.dispose();
    },
    [boxGeo, postMat, panelMat],
  );

  const postSpecs = useMemo(() => buildFenceInstances(), []);
  const panelSpecs = useMemo(() => buildFencePanels(), []);
  const postRef = useRef<THREE.InstancedMesh>(null);
  const panelRef = useRef<THREE.InstancedMesh>(null);
  useApplyInstances(postRef, postSpecs, [postSpecs]);
  useApplyInstances(panelRef, panelSpecs, [panelSpecs]);

  return (
    <group>
      <instancedMesh name="structure:fence-post" ref={postRef} args={[boxGeo, postMat, postSpecs.length]} castShadow />
      <instancedMesh name="structure:fence-panel" ref={panelRef} args={[boxGeo, panelMat, panelSpecs.length]} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* <RoadKerbs>                                                         */
/* ------------------------------------------------------------------ */

export function RoadKerbs({ color }: { color: string }) {
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }), [color]);
  useEffect(
    () => () => {
      boxGeo.dispose();
      mat.dispose();
    },
    [boxGeo, mat],
  );
  const specs = useMemo(() => buildKerbs(), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useApplyInstances(ref, specs, [specs]);
  if (!specs.length) return null;
  return <instancedMesh name="structure:road-kerb" ref={ref} args={[boxGeo, mat, specs.length]} receiveShadow />;
}

/* ------------------------------------------------------------------ */
/* <Galleries>                                                         */
/* ------------------------------------------------------------------ */

export function Galleries({ color, zone }: { color: string; zone: ZoneId | 'all' }) {
  const shown = zone === 'all' ? GALLERIES : GALLERIES.filter((g) => galleryTouchesZone(g, zone));
  const observed = shown.filter((g) => g.observed);
  const inferred = shown.filter((g) => !g.observed);

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const solidMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.35 }), [color]);
  const inferredMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.35, transparent: true, opacity: 0.75 }),
    [color],
  );
  useEffect(
    () => () => {
      boxGeo.dispose();
      solidMat.dispose();
      inferredMat.dispose();
    },
    [boxGeo, solidMat, inferredMat],
  );

  const observedSpecs = useMemo(() => observed.flatMap((g) => buildTrussMembers(g)), [observed.map((g) => g.from.join(',') + g.to.join(',')).join('|')]);
  const inferredSpecs = useMemo(() => inferred.flatMap((g) => buildTrussMembers(g)), [inferred.map((g) => g.from.join(',') + g.to.join(',')).join('|')]);

  const observedRef = useRef<THREE.InstancedMesh>(null);
  const inferredRef = useRef<THREE.InstancedMesh>(null);
  useApplyInstances(observedRef, observedSpecs, [observedSpecs]);
  useApplyInstances(inferredRef, inferredSpecs, [inferredSpecs]);

  return (
    <group>
      {observedSpecs.length > 0 && (
        <instancedMesh
          name="structure:gallery-truss-observed"
          ref={observedRef}
          args={[boxGeo, solidMat, observedSpecs.length]}
          castShadow
          receiveShadow
        />
      )}
      {inferredSpecs.length > 0 && (
        <instancedMesh name="structure:gallery-truss-inferred" ref={inferredRef} args={[boxGeo, inferredMat, inferredSpecs.length]} />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* <LightMasts>                                                        */
/* ------------------------------------------------------------------ */

export function LightMasts({ strength, color, lowPower }: { strength: number; color: string; lowPower: boolean }) {
  const masts = lowPower ? LIGHT_MASTS.filter((_, i) => i % 2 === 0) : LIGHT_MASTS;

  const columnGeo = useMemo(() => new THREE.CylinderGeometry(0.28, 0.42, 1, 6), []);
  const headGeo = useMemo(() => new THREE.CylinderGeometry(1, 0.7, 1, 8), []);
  const lampGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), []);
  /* Apex at local y=0, base at y=-1, radius 1 — see the note on
     `buildMastParts`'s `cone` matrix above. */
  const coneGeo = useMemo(() => {
    const geo = new THREE.ConeGeometry(1, 1, 12, 1, true);
    geo.translate(0, -0.5, 0);
    return geo;
  }, []);

  const columnMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3f4855', roughness: 0.8, metalness: 0.4 }), []);
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2c333d', roughness: 0.7, metalness: 0.5 }), []);
  const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color, toneMapped: false }), [color]);
  const coneMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12 * strength,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [color, strength],
  );
  useEffect(() => {
    lampMat.color.set(color);
  }, [lampMat, color]);
  useEffect(
    () => () => {
      columnGeo.dispose();
      headGeo.dispose();
      lampGeo.dispose();
      coneGeo.dispose();
      columnMat.dispose();
      headMat.dispose();
      lampMat.dispose();
      coneMat.dispose();
    },
    [columnGeo, headGeo, lampGeo, coneGeo, columnMat, headMat, lampMat, coneMat],
  );

  const built = useMemo(() => masts.map((m) => buildMastParts(m)), [masts.length, lowPower]);
  const columnRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const lampRef = useRef<THREE.InstancedMesh>(null);
  const coneRef = useRef<THREE.InstancedMesh>(null);
  const columnSpecs = built.map((p) => p.column);
  const headSpecs = built.map((p) => p.head);
  const lampSpecs = built.map((p) => p.lamp);
  const coneSpecs = built.map((p) => p.cone);
  useApplyInstances(columnRef, columnSpecs, [columnSpecs]);
  useApplyInstances(headRef, headSpecs, [headSpecs]);
  useApplyInstances(lampRef, lampSpecs, [lampSpecs]);
  useApplyInstances(coneRef, coneSpecs, [coneSpecs]);

  if (strength <= 0 || !masts.length) return null;

  return (
    <group>
      <instancedMesh name="structure:mast-column" ref={columnRef} args={[columnGeo, columnMat, masts.length]} castShadow />
      <instancedMesh name="structure:mast-head" ref={headRef} args={[headGeo, headMat, masts.length]} castShadow />
      <instancedMesh name="structure:mast-lamp" ref={lampRef} args={[lampGeo, lampMat, masts.length]} />
      <instancedMesh name="structure:mast-cone" ref={coneRef} args={[coneGeo, coneMat, masts.length]} raycast={() => null} />
      {masts.map((m, i) => (
        <pointLight key={i} position={[m.x, m.height, m.z]} color={color} intensity={5200 * strength} distance={165} decay={2} />
      ))}
    </group>
  );
}
