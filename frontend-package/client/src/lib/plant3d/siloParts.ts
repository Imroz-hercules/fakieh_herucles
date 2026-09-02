/**
 * Silo geometry primitives.
 *
 * Every archetype in `siloGeometry.ts` is assembled from these small helpers —
 * plain three.js primitives (cylinder, box, torus, sphere-cap), each tagged
 * with a per-vertex `aPart` float so the shader (`siloShader.ts`, owned by
 * another agent) can shade wall/roof/hopper/structure/rings/accents
 * differently from one merged geometry.
 *
 * `aPart` values — the contract with the shader:
 *   0 shell wall (barrel)
 *   1 roof
 *   2 hopper cone + outlet
 *   3 structure (legs, braces, foot, skirt, frame, ladder rails)
 *   4 rings/seams/stiffeners/railing
 *   5 accents (hatch cylinder, hatch ring)
 *
 * Object space stays real metres, floor at y=0 — the scene applies drawScale
 * per instance and the 1.55x vertical exaggeration on the group, same as
 * every other part of this view.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PART = {
  WALL: 0,
  ROOF: 1,
  HOPPER: 2,
  STRUCTURE: 3,
  RING: 4,
  ACCENT: 5,
} as const;

/** Tags every vertex of `geo` with a constant `aPart`, and backfills `uv`
    /`normal` if a primitive happens not to carry them (none of the ones used
    here omit them, but this keeps `mergeParts` safe against a future one that
    does). */
function tagPart(geo: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const n = geo.getAttribute('position').count;
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}

/** A vertical frustum: `radiusTop` at `centerY + height/2`, `radiusBottom` at
    `centerY - height/2`. A plain cylinder when the two radii are equal. */
export function cylinderPart(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments: number,
  centerY: number,
  part: number,
  openEnded = false,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(
    Math.max(radiusTop, 0.001),
    Math.max(radiusBottom, 0.001),
    Math.max(height, 0.001),
    Math.max(3, radialSegments),
    1,
    openEnded,
  );
  geo.translate(0, centerY, 0);
  return tagPart(geo, part);
}

/** A box, optionally rotated about Y before being placed. */
export function boxPart(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  part: number,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001));
  if (rotY) geo.rotateY(rotY);
  geo.translate(x, y, z);
  return tagPart(geo, part);
}

/** A horizontal box, useful for cross-braces and conveyor beams. */
export function beamPart(
  length: number,
  h: number,
  w: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  part: number,
): THREE.BufferGeometry {
  return boxPart(length, h, w, x, y, z, rotY, part);
}

/** A flat ring — the low-poly "torus-like" stiffener / rail ring the plan
    calls for, `radialSegments` around the ring x `tubularSegments` around the
    tube cross-section (24x4 is what the plan specifies). `arc` < 2*PI gives a
    partial ring — used for the ladder cage hoops, open on the wall side. */
export function ringPart(
  radius: number,
  tube: number,
  radialSegments: number,
  tubularSegments: number,
  y: number,
  part: number,
  arc = Math.PI * 2,
  rotY = 0,
): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(
    Math.max(radius, 0.01),
    Math.max(tube, 0.005),
    Math.max(3, tubularSegments),
    Math.max(3, radialSegments),
    arc,
  );
  geo.rotateX(Math.PI / 2);
  if (rotY) geo.rotateZ(rotY);
  geo.translate(0, y, 0);
  return tagPart(geo, part);
}

/**
 * A shallow dome cap: a hemisphere (base radius exactly `radius`, apex height
 * `radius`) squashed in Y to the real rise, base sitting at `y`.
 *
 * Using a true hemisphere (thetaLength = PI/2) rather than solving for a
 * shallower spherical cap keeps the base ring at exactly `radius` — flush
 * with the barrel it sits on — and the squash is then just `rise / radius`.
 */
export function domeCapPart(
  radius: number,
  rise: number,
  radialSegments: number,
  y: number,
  part: number,
): THREE.BufferGeometry {
  const heightSegments = Math.max(4, Math.round(radialSegments / 2));
  const geo = new THREE.SphereGeometry(
    Math.max(radius, 0.01),
    Math.max(6, radialSegments),
    heightSegments,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  geo.scale(1, Math.max(rise, 0.001) / Math.max(radius, 0.01), 1);
  geo.translate(0, y, 0);
  return tagPart(geo, part);
}

/** A cylinder lying on its side along X — the screw-feeder stub. */
export function horizontalCylinderPart(
  radius: number,
  length: number,
  radialSegments: number,
  x: number,
  y: number,
  z: number,
  part: number,
  axis: 'x' | 'z' = 'z',
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(
    Math.max(radius, 0.01),
    Math.max(radius, 0.01),
    Math.max(length, 0.01),
    Math.max(8, radialSegments),
  );
  geo.rotateX(axis === 'z' ? Math.PI / 2 : 0);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  geo.translate(x, y, z);
  return tagPart(geo, part);
}

/**
 * Merges parts into one geometry with a shared `aPart` attribute, disposing
 * the originals. `three.js` 0.169's `BufferGeometryUtils.mergeGeometries`
 * requires every input to carry the same attribute set — every helper above
 * guarantees position/normal/uv/aPart, so any mix of them merges cleanly.
 */
export function mergeParts(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geoms.length === 1) return geoms[0];
  const merged = mergeGeometries(geoms, false);
  if (!merged) throw new Error('siloParts.mergeParts: mergeGeometries returned null');
  for (const g of geoms) g.dispose();
  return merged;
}

/** Total triangle count of a (possibly non-indexed) geometry. */
export function triCount(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  return geo.getAttribute('position').count / 3;
}
