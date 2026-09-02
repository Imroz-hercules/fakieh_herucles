/**
 * Outside-world dressing (client request, 2026-09-02, verbatim): "why not
 * play with the outside world a bit? look at the satellite images and see
 * what we can add, to make the world filled but not take from the GPU, just
 * to make it look nice and not just a world with silos and empty."
 *
 * This file draws the industrial estate AROUND the plant — neighbouring
 * warehouses, the estate's street grid, tree lines, parked trucks and cars,
 * a liquid-tank farm, a container depot and a sand/aggregate stockpile —
 * everything `DESIGN.md` calls "the world" as opposed to "the data". None of
 * it is plant data: it is read off the aerial imagery
 * (`Fakieh_SCADA_img/aerial/esri_wide_800m.png`, `model_overlay_v2.png`,
 * `site_esri_z19_site_grid10m.png`) at the same "traced, not surveyed"
 * standard the rest of `site.ts` already uses, one step further removed
 * again — these are the plant's NEIGHBOURS, imagery nobody was asked to
 * ground-truth. Every position lives in `site.ts` (`NEIGHBOURS`, `STREETS`,
 * `TREE_LINES`, `PARKED_VEHICLES`, `STOCKPILES`, `CONTAINER_ROWS`,
 * `TANK_FARM`); this file only builds geometry from it.
 *
 * Same split as `structures.tsx`: a PURE builder per category (matrix maths
 * only, no React, no WebGL) so `scripts/verify-structures.mjs` can check the
 * real expanded geometry without mounting a `Canvas`, then a thin React
 * component that calls those builders in a `useMemo` and hands the result to
 * one `InstancedMesh` per category.
 *
 * Budget (client's own words: "not take from the GPU"): 12 draw calls total,
 * every one an `InstancedMesh` sharing one of five small unit geometries
 * (box, roof prism, tree-canopy X-billboard, tank cylinder, stockpile cone).
 * ~3.4k triangles total across every instance — see the delivery report for
 * the per-category table. Nothing here casts a shadow except the neighbour
 * buildings (one instanced mesh, `castShadow`): everything else is flat
 * background dressing, and a shadow map does not need to know about a
 * parked car three streets away.
 *
 * Colour is deliberately restrained — `DESIGN.md`'s "the world is neutral,
 * data is the only colour" applies just as much out here as it does inside
 * the fence: pale wall/roof greys, dark asphalt, a red-brown kerb, a
 * desaturated tree green, white tanks, rust-grey containers, sand-coloured
 * stockpiles. Nothing here is cyan, and nothing here is data.
 *
 * STATIC. No `useFrame`, no motion of any kind — the client's own rule
 * (`PRODUCT.md`: "Motion — purposeful only") is even stricter for a truck
 * that was never measured than for one that was.
 */
import { useEffect, useMemo, useRef, type DependencyList, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CONTAINER_ROWS,
  NEIGHBOURS,
  PARKED_VEHICLES,
  STOCKPILES,
  STREETS,
  TANK_FARM,
  TREE_LINES,
  type ContainerRowSpec,
  type DressingTank,
  type NeighbourBuilding,
  type Stockpile,
  type Street,
  type TreeLine,
  type VehicleRow,
  type ZoneId,
} from './site';
import { ZONE_FOOTPRINT, type InstanceSpec } from './structures';

/* ------------------------------------------------------------------ */
/* Shared instance-matrix maths — mirrors structures.tsx's own helpers, */
/* duplicated rather than imported because those are file-local there. */
/* ------------------------------------------------------------------ */

const BOX_MIN: [number, number, number] = [-0.5, -0.5, -0.5];
const BOX_MAX: [number, number, number] = [0.5, 0.5, 0.5];
/** The roof prism and the tree-canopy X-billboard both sit ON TOP of local
 *  y=0 (apex/top at y=1) rather than straddling their own origin — same
 *  convention `structures.tsx`'s `PRISM_MIN`/`PRISM_MAX` uses. */
const TOP_MIN: [number, number, number] = [-0.5, 0, -0.5];
const TOP_MAX: [number, number, number] = [0.5, 1, 0.5];

const _dummy = new THREE.Object3D();

/** Composes a world matrix from position/Euler/scale. Safe with a single
 *  non-zero rotation axis (Y), which is every caller in this file. */
function composeMatrix(
  position: readonly [number, number, number],
  rotationY: number,
  scale: readonly [number, number, number],
): THREE.Matrix4 {
  _dummy.position.set(position[0], position[1], position[2]);
  _dummy.rotation.set(0, rotationY, 0);
  _dummy.scale.set(scale[0], scale[1], scale[2]);
  _dummy.updateMatrix();
  return _dummy.matrix.clone();
}

/** Walks a line `from` -> `to` at roughly `spacing` metres, returning the
 *  sampled points plus the line's own heading (radians, for facing
 *  vehicles/trees along the row they stand on). Always at least one point. */
function walkLine(from: readonly [number, number], to: readonly [number, number], spacing: number) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const heading = Math.atan2(dz, dx);
  const n = Math.max(1, Math.round(len / Math.max(spacing, 0.5)) + 1);
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    points.push([from[0] + dx * t, from[1] + dz * t]);
  }
  return { points, heading };
}

/* ------------------------------------------------------------------ */
/* Neighbouring warehouses                                             */
/* ------------------------------------------------------------------ */

const FLAT_ROOF_RISE = 0.25;
const RIDGED_ROOF_RISE = 2.2;

/** One box per neighbour, real footprint and eaves height — no rotation,
 *  every neighbour footprint is traced axis-aligned off the aerial (the
 *  estate's block grid runs parallel to the plant's own axes). */
export function buildNeighbourWallInstances(list: NeighbourBuilding[] = NEIGHBOURS): InstanceSpec[] {
  return list.map((b) => ({
    matrix: composeMatrix([b.x, b.height / 2, b.z], 0, [b.length, b.height, b.width]),
  }));
}

/** One roof prism per neighbour, sharing ONE `InstancedMesh` with the walls'
 *  sibling mesh: a 'flat' roof gets a near-zero rise, a 'ridged' one a real
 *  ridge, both the same unit prism geometry scaled differently per instance
 *  — "one InstancedMesh for roofs" without needing two roof archetypes. */
export function buildNeighbourRoofInstances(list: NeighbourBuilding[] = NEIGHBOURS): InstanceSpec[] {
  return list.map((b) => {
    const rise = b.roof === 'ridged' ? RIDGED_ROOF_RISE : FLAT_ROOF_RISE;
    return {
      matrix: composeMatrix([b.x, b.height, b.z], 0, [b.length, rise, b.width]),
      localMin: TOP_MIN,
      localMax: TOP_MAX,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Estate streets                                                      */
/* ------------------------------------------------------------------ */

/** One slab per street, oriented by its own `axis` — never touches the
 *  ground shader's `ROADS`/`MAX_ROADS`, this is a separate flat-plane layer
 *  drawn just above it (y = `STREET_Y`). */
const STREET_Y = 0.01;
/** Same shape as `structures.tsx`'s `KERB` (0.3m wide, 0.15m tall, 0.15m
 *  outside the paved half-width) — restated here rather than imported so
 *  this file's own street layer stays independent of the plant-road kerb's
 *  colour and material choices. */
const KERB_WIDTH = 0.3;
const KERB_HEIGHT = 0.15;
const KERB_OFFSET = 0.15;

export function buildStreetSlabInstances(list: Street[] = STREETS): InstanceSpec[] {
  return list.map((s) => {
    const alongX = s.axis === 'x';
    const scale: [number, number, number] = alongX ? [s.length, 0.02, s.width] : [s.width, 0.02, s.length];
    return { matrix: composeMatrix([s.x, STREET_Y, s.z], 0, scale) };
  });
}

/** Two kerb strips per street, `KERB_OFFSET` outside its own paved half-width
 *  — same construction `structures.tsx`'s `buildKerbs` uses for `ROADS`. */
export function buildStreetKerbInstances(list: Street[] = STREETS): InstanceSpec[] {
  const out: InstanceSpec[] = [];
  const off = KERB_OFFSET + KERB_WIDTH / 2;
  for (const s of list) {
    const alongX = s.axis === 'x';
    const half = s.width / 2;
    for (const sign of [-1, 1] as const) {
      if (alongX) {
        out.push({
          matrix: composeMatrix([s.x, KERB_HEIGHT / 2, s.z + sign * (half + off)], 0, [s.length, KERB_HEIGHT, KERB_WIDTH]),
        });
      } else {
        out.push({
          matrix: composeMatrix([s.x + sign * (half + off), KERB_HEIGHT / 2, s.z], 0, [KERB_WIDTH, KERB_HEIGHT, s.length]),
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tree lines                                                          */
/* ------------------------------------------------------------------ */

const TREE_CANOPY_SIZE = 4;
const TREE_CANOPY_HEIGHT = 6;
const TRUNK_WIDTH = 0.3;
const TRUNK_HEIGHT = 1.4;

/** Expands every `TreeLine` into individual trees: an X-billboard canopy
 *  (two crossed quads, drawn by the component as one merged geometry, alpha
 *  tested rather than sorted) plus a short trunk box. */
export function buildTreeInstances(lines: TreeLine[] = TREE_LINES): { canopy: InstanceSpec[]; trunk: InstanceSpec[] } {
  const canopy: InstanceSpec[] = [];
  const trunk: InstanceSpec[] = [];
  for (const line of lines) {
    const { points } = walkLine(line.from, line.to, line.spacing);
    for (const [x, z] of points) {
      canopy.push({
        matrix: composeMatrix([x, 0, z], 0, [TREE_CANOPY_SIZE, TREE_CANOPY_HEIGHT, TREE_CANOPY_SIZE]),
        localMin: TOP_MIN,
        localMax: TOP_MAX,
      });
      trunk.push({ matrix: composeMatrix([x, TRUNK_HEIGHT / 2, z], 0, [TRUNK_WIDTH, TRUNK_HEIGHT, TRUNK_WIDTH]) });
    }
  }
  return { canopy, trunk };
}

/* ------------------------------------------------------------------ */
/* Parked vehicles                                                     */
/* ------------------------------------------------------------------ */

const CAB = { length: 2.5, width: 2.5, height: 2.5 };
const TRAILER = { length: 12, width: 3.5, height: 2.6 };
const CAR = { length: 4.5, width: 1.5, height: 1.8 };
/** Cab-to-trailer gap: half the trailer plus half the cab, so the cab sits
 *  flush against the trailer's front face. */
const CAB_OFFSET = TRAILER.length / 2 + CAB.length / 2;

/** Expands every `VehicleRow` into trucks (cab + trailer, two boxes) and
 *  cars (one box), each facing along its own row. */
export function buildVehicleInstances(rows: VehicleRow[] = PARKED_VEHICLES): {
  truckCab: InstanceSpec[];
  truckTrailer: InstanceSpec[];
  car: InstanceSpec[];
} {
  const truckCab: InstanceSpec[] = [];
  const truckTrailer: InstanceSpec[] = [];
  const car: InstanceSpec[] = [];
  for (const row of rows) {
    const { points, heading } = walkLine(row.from, row.to, row.spacing);
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    for (const [x, z] of points) {
      if (row.kind === 'truck') {
        truckTrailer.push({
          matrix: composeMatrix([x, TRAILER.height / 2, z], heading, [TRAILER.length, TRAILER.height, TRAILER.width]),
        });
        truckCab.push({
          matrix: composeMatrix(
            [x - fx * CAB_OFFSET, CAB.height / 2, z - fz * CAB_OFFSET],
            heading,
            [CAB.length, CAB.height, CAB.width],
          ),
        });
      } else {
        car.push({ matrix: composeMatrix([x, CAR.height / 2, z], heading, [CAR.length, CAR.height, CAR.width]) });
      }
    }
  }
  return { truckCab, truckTrailer, car };
}

/* ------------------------------------------------------------------ */
/* Tank farm                                                            */
/* ------------------------------------------------------------------ */

/** One cylinder per tank — the unit cylinder is radius 0.5, height 1,
 *  centred on its own origin, so X/Z scale by `diameter` gives the right
 *  radius and the box-default local bounds already match its AABB. */
export function buildTankInstances(list: DressingTank[] = TANK_FARM): InstanceSpec[] {
  return list.map((t) => ({
    matrix: composeMatrix([t.x, t.height / 2, t.z], 0, [t.diameter, t.height, t.diameter]),
  }));
}

/* ------------------------------------------------------------------ */
/* Container rows                                                      */
/* ------------------------------------------------------------------ */

const CONTAINER = { length: 12, width: 2.6, height: 2.4 };

/** Expands each `ContainerRowSpec` into `rows * perRow` boxes laid end to
 *  end along +X, `rowSpacing` apart along Z. */
export function buildContainerInstances(list: ContainerRowSpec[] = CONTAINER_ROWS): InstanceSpec[] {
  const out: InstanceSpec[] = [];
  for (const spec of list) {
    for (let r = 0; r < spec.rows; r++) {
      const z = spec.originZ + r * spec.rowSpacing;
      for (let i = 0; i < spec.perRow; i++) {
        const x = spec.originX + i * spec.itemSpacing;
        out.push({
          matrix: composeMatrix([x, CONTAINER.height / 2, z], 0, [CONTAINER.length, CONTAINER.height, CONTAINER.width]),
          color: i % 2 === 0 ? '#8a7a70' : '#8f9296',
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Stockpiles                                                          */
/* ------------------------------------------------------------------ */

/** One cone per pile — unit cone base radius 0.5 at local y=0, apex at
 *  local y=1 (see the component's `stockpileGeo`), so scale directly by
 *  `[diameter, height, diameter]`. */
export function buildStockpileInstances(list: Stockpile[] = STOCKPILES): InstanceSpec[] {
  return list.map((p) => ({
    matrix: composeMatrix([p.x, 0, p.z], 0, [p.diameter, p.height, p.diameter]),
    localMin: TOP_MIN,
    localMax: TOP_MAX,
  }));
}

/* ------------------------------------------------------------------ */
/* Zone reach — "visible in all zones, but only within 150m of the     */
/* zone's own footprint" so a zone view keeps its context without      */
/* drawing (or overdrawing) the entire estate.                         */
/* ------------------------------------------------------------------ */

const ZONE_REACH = 150;

function withinZoneReach(zone: ZoneId | 'all', x: number, z: number): boolean {
  if (zone === 'all') return true;
  const fp = ZONE_FOOTPRINT[zone];
  const dx = Math.max(fp.minX - x, 0, x - fp.maxX);
  const dz = Math.max(fp.minZ - z, 0, z - fp.maxZ);
  return Math.hypot(dx, dz) <= ZONE_REACH;
}

function lineMid(a: readonly [number, number], b: readonly [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/* ------------------------------------------------------------------ */
/* React: shared instancing helper — same pattern as structures.tsx's  */
/* `useApplyInstances`, duplicated because that one is file-local.     */
/* ------------------------------------------------------------------ */

function useApplyInstances(ref: MutableRefObject<THREE.InstancedMesh | null>, specs: InstanceSpec[], deps: DependencyList) {
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let hasColor = false;
    specs.forEach((spec, i) => {
      mesh.setMatrixAt(i, spec.matrix);
      if (spec.color) hasColor = true;
    });
    if (hasColor) {
      specs.forEach((spec, i) => mesh.setColorAt(i, new THREE.Color(spec.color ?? '#ffffff')));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ------------------------------------------------------------------ */
/* Tree-canopy texture — a soft flat-colour blob silhouette, generated */
/* once on a tiny canvas and alpha-tested rather than sorted.          */
/* Only ever built inside a React effect/memo (never at module scope), */
/* so Node's headless bundle in verify-structures.mjs never touches    */
/* `document` — see the note on siloShader.ts's own texture helpers.   */
/* ------------------------------------------------------------------ */

function makeCanopyTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const cx = size / 2;
  const cy = size / 2 + 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // An irregular blob rather than a perfect disc: two overlapping
      // off-centre lobes read as foliage, not a lollipop, at the ~40px on
      // screen these ever actually occupy.
      const d1 = Math.hypot((x - cx) / (size * 0.42), (y - cy) / (size * 0.38));
      const d2 = Math.hypot((x - cx + 8) / (size * 0.3), (y - cy - 6) / (size * 0.3));
      const d = Math.min(d1, d2);
      const a = d < 1 ? 255 : 0;
      data[i] = 0x6f;
      data[i + 1] = 0x7f;
      data[i + 2] = 0x5e;
      data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/* <SiteDressing>                                                      */
/* ------------------------------------------------------------------ */

export interface SiteDressingProps {
  /** Zone currently framed — dressing near that zone's own footprint stays
   *  visible in every zone view, everything else is culled at 150m. */
  zone: ZoneId | 'all';
  /** Halves tree and vehicle density; every other category is already cheap
   *  enough that halving it would not be worth the extra branch. */
  lowPower: boolean;
}

const NEIGHBOUR_WALL_COLOR = '#c9ccd0';
const NEIGHBOUR_ROOF_COLOR = '#b9bdc2';
const STREET_COLOR = '#4a4d52';
const KERB_COLOR = '#a08a7a';
const TRUNK_COLOR = '#5a4a3a';
const TRUCK_COLOR = '#d5d8db';
const CAR_COLORS = ['#c7cacd', '#9aa0a5', '#6f757b'];
const TANK_COLOR = '#dcdfe2';
const STOCKPILE_COLOR = '#c9b79a';

export function SiteDressing({ zone, lowPower }: SiteDressingProps) {
  const neighbours = useMemo(() => NEIGHBOURS.filter((b) => withinZoneReach(zone, b.x, b.z)), [zone]);
  const streets = useMemo(() => STREETS.filter((s) => withinZoneReach(zone, s.x, s.z)), [zone]);
  const treeLines = useMemo(
    () => TREE_LINES.filter((t) => withinZoneReach(zone, ...lineMid(t.from, t.to))),
    [zone],
  );
  const vehicleRows = useMemo(
    () => PARKED_VEHICLES.filter((r) => withinZoneReach(zone, ...lineMid(r.from, r.to))),
    [zone],
  );
  const stockpiles = useMemo(() => STOCKPILES.filter((p) => withinZoneReach(zone, p.x, p.z)), [zone]);
  const containerRows = useMemo(
    () => CONTAINER_ROWS.filter((c) => withinZoneReach(zone, c.originX, c.originZ)),
    [zone],
  );
  const tanks = useMemo(() => TANK_FARM.filter((t) => withinZoneReach(zone, t.x, t.z)), [zone]);

  /* geometries — five small unit shapes, shared across every mesh that can
     use them (the plain box is reused for walls, streets, kerbs, trunks,
     truck cab/trailer, cars and containers). */
  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const roofGeo = useMemo(() => {
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
  const canopyGeo = useMemo(() => {
    const a = new THREE.PlaneGeometry(1, 1);
    a.translate(0, 0.5, 0);
    const b = a.clone();
    b.rotateY(Math.PI / 2);
    const merged = mergeGeometries([a, b], false);
    a.dispose();
    b.dispose();
    return merged ?? new THREE.PlaneGeometry(1, 1);
  }, []);
  const tankGeo = useMemo(() => new THREE.CylinderGeometry(0.5, 0.5, 1, 20), []);
  const stockpileGeo = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.5, 1, 20);
    geo.translate(0, 0.5, 0); // base at local y=0, apex at y=1
    return geo;
  }, []);

  useEffect(
    () => () => {
      boxGeo.dispose();
      roofGeo.dispose();
      canopyGeo.dispose();
      tankGeo.dispose();
      stockpileGeo.dispose();
    },
    [boxGeo, roofGeo, canopyGeo, tankGeo, stockpileGeo],
  );

  /* materials */
  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: NEIGHBOUR_WALL_COLOR, roughness: 0.88, metalness: 0.04 }),
    [],
  );
  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: NEIGHBOUR_ROOF_COLOR, roughness: 0.82, metalness: 0.05 }),
    [],
  );
  const streetMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STREET_COLOR, roughness: 0.96, metalness: 0 }), []);
  const kerbMat = useMemo(() => new THREE.MeshStandardMaterial({ color: KERB_COLOR, roughness: 0.9, metalness: 0 }), []);
  const canopyTexture = useMemo(() => makeCanopyTexture(), []);
  const canopyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: canopyTexture,
        alphaTest: 0.5,
        transparent: false,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0,
      }),
    [canopyTexture],
  );
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: TRUNK_COLOR, roughness: 0.95, metalness: 0 }), []);
  const truckMat = useMemo(() => new THREE.MeshStandardMaterial({ color: TRUCK_COLOR, roughness: 0.6, metalness: 0.1 }), []);
  const carMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.15 }), []);
  const tankMat = useMemo(() => new THREE.MeshStandardMaterial({ color: TANK_COLOR, roughness: 0.4, metalness: 0.3 }), []);
  const containerMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, metalness: 0.15 }), []);
  const stockpileMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STOCKPILE_COLOR, roughness: 1, metalness: 0 }),
    [],
  );

  useEffect(
    () => () => {
      wallMat.dispose();
      roofMat.dispose();
      streetMat.dispose();
      kerbMat.dispose();
      canopyMat.dispose();
      canopyTexture.dispose();
      trunkMat.dispose();
      truckMat.dispose();
      carMat.dispose();
      tankMat.dispose();
      containerMat.dispose();
      stockpileMat.dispose();
    },
    [wallMat, roofMat, streetMat, kerbMat, canopyMat, canopyTexture, trunkMat, truckMat, carMat, tankMat, containerMat, stockpileMat],
  );

  /* instance specs */
  const wallSpecs = useMemo(() => buildNeighbourWallInstances(neighbours), [neighbours]);
  const roofSpecs = useMemo(() => buildNeighbourRoofInstances(neighbours), [neighbours]);
  const slabSpecs = useMemo(() => buildStreetSlabInstances(streets), [streets]);
  const kerbSpecs = useMemo(() => buildStreetKerbInstances(streets), [streets]);
  const trees = useMemo(() => buildTreeInstances(treeLines), [treeLines]);
  const vehicles = useMemo(() => buildVehicleInstances(vehicleRows), [vehicleRows]);
  const tankSpecs = useMemo(() => buildTankInstances(tanks), [tanks]);
  const containerSpecs = useMemo(() => buildContainerInstances(containerRows), [containerRows]);
  const stockpileSpecs = useMemo(() => buildStockpileInstances(stockpiles), [stockpiles]);

  /* lowPower halves the two categories with real counts (trees, vehicles);
     everything else is already a handful of instances. */
  const canopySpecs = lowPower ? trees.canopy.filter((_, i) => i % 2 === 0) : trees.canopy;
  const trunkSpecs = lowPower ? trees.trunk.filter((_, i) => i % 2 === 0) : trees.trunk;
  const truckCabSpecs = lowPower ? vehicles.truckCab.filter((_, i) => i % 2 === 0) : vehicles.truckCab;
  const truckTrailerSpecs = lowPower ? vehicles.truckTrailer.filter((_, i) => i % 2 === 0) : vehicles.truckTrailer;
  const carSpecs = (lowPower ? vehicles.car.filter((_, i) => i % 2 === 0) : vehicles.car).map((spec, i) => ({
    ...spec,
    color: CAR_COLORS[i % CAR_COLORS.length],
  }));

  const wallRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const slabRef = useRef<THREE.InstancedMesh>(null);
  const kerbRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const truckCabRef = useRef<THREE.InstancedMesh>(null);
  const truckTrailerRef = useRef<THREE.InstancedMesh>(null);
  const carRef = useRef<THREE.InstancedMesh>(null);
  const tankRef = useRef<THREE.InstancedMesh>(null);
  const containerRef = useRef<THREE.InstancedMesh>(null);
  const stockpileRef = useRef<THREE.InstancedMesh>(null);

  useApplyInstances(wallRef, wallSpecs, [wallSpecs]);
  useApplyInstances(roofRef, roofSpecs, [roofSpecs]);
  useApplyInstances(slabRef, slabSpecs, [slabSpecs]);
  useApplyInstances(kerbRef, kerbSpecs, [kerbSpecs]);
  useApplyInstances(canopyRef, canopySpecs, [canopySpecs]);
  useApplyInstances(trunkRef, trunkSpecs, [trunkSpecs]);
  useApplyInstances(truckCabRef, truckCabSpecs, [truckCabSpecs]);
  useApplyInstances(truckTrailerRef, truckTrailerSpecs, [truckTrailerSpecs]);
  useApplyInstances(carRef, carSpecs, [carSpecs]);
  useApplyInstances(tankRef, tankSpecs, [tankSpecs]);
  useApplyInstances(containerRef, containerSpecs, [containerSpecs]);
  useApplyInstances(stockpileRef, stockpileSpecs, [stockpileSpecs]);

  return (
    <group name="dressing:root">
      {wallSpecs.length > 0 && (
        <instancedMesh name="dressing:neighbour-wall" ref={wallRef} args={[boxGeo, wallMat, wallSpecs.length]} castShadow receiveShadow />
      )}
      {roofSpecs.length > 0 && (
        <instancedMesh name="dressing:neighbour-roof" ref={roofRef} args={[roofGeo, roofMat, roofSpecs.length]} castShadow receiveShadow />
      )}
      {slabSpecs.length > 0 && (
        <instancedMesh name="dressing:street-slab" ref={slabRef} args={[boxGeo, streetMat, slabSpecs.length]} receiveShadow />
      )}
      {kerbSpecs.length > 0 && (
        <instancedMesh name="dressing:street-kerb" ref={kerbRef} args={[boxGeo, kerbMat, kerbSpecs.length]} receiveShadow />
      )}
      {canopySpecs.length > 0 && (
        <instancedMesh name="dressing:tree-canopy" ref={canopyRef} args={[canopyGeo, canopyMat, canopySpecs.length]} />
      )}
      {trunkSpecs.length > 0 && (
        <instancedMesh name="dressing:tree-trunk" ref={trunkRef} args={[boxGeo, trunkMat, trunkSpecs.length]} />
      )}
      {truckCabSpecs.length > 0 && (
        <instancedMesh name="dressing:truck-cab" ref={truckCabRef} args={[boxGeo, truckMat, truckCabSpecs.length]} />
      )}
      {truckTrailerSpecs.length > 0 && (
        <instancedMesh name="dressing:truck-trailer" ref={truckTrailerRef} args={[boxGeo, truckMat, truckTrailerSpecs.length]} />
      )}
      {carSpecs.length > 0 && <instancedMesh name="dressing:car" ref={carRef} args={[boxGeo, carMat, carSpecs.length]} />}
      {tankSpecs.length > 0 && (
        <instancedMesh name="dressing:tank" ref={tankRef} args={[tankGeo, tankMat, tankSpecs.length]} />
      )}
      {containerSpecs.length > 0 && (
        <instancedMesh name="dressing:container" ref={containerRef} args={[boxGeo, containerMat, containerSpecs.length]} />
      )}
      {stockpileSpecs.length > 0 && (
        <instancedMesh name="dressing:stockpile" ref={stockpileRef} args={[stockpileGeo, stockpileMat, stockpileSpecs.length]} />
      )}
    </group>
  );
}
