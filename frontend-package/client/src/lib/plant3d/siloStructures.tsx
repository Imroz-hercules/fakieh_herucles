/**
 * Structure shared across a whole group, rather than repeated per bin.
 *
 * Everything in `siloGeometry.ts`'s `buildBaseGeometry` is per-instance —
 * legs, rings, hatches, all drawn once and repeated by the `InstancedMesh`.
 * The finished-feed conveyors are different: CC121.1/.2/.3 each run the
 * FULL LENGTH of their row, over the tops of 16 bins, and are one physical
 * structure rather than sixteen repeats of a slice. Building them as one
 * static mesh per group (not per bin, and not instanced) is both the
 * correct picture and far cheaper — three beams instead of forty-eight.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { SiloGroupSpec, SiloPlacement } from './silos';
import { boxPart, mergeParts } from './siloParts';

const STRUCTURE_COLOR = '#3b4249';

/**
 * Exported (not just used internally) so `verify-plant3d.mjs`'s triangle
 * budget check can measure the finished-feed zone's shared structure without
 * mounting a React tree — the check bundles this module headlessly the same
 * way it bundles `siloGeometry.ts`.
 */
export function buildConveyors(placements: SiloPlacement[]): THREE.BufferGeometry | null {
  if (!placements.length) return null;
  /* Group by row (Z), rounded to kill float noise from the size-compression
     pitch maths. */
  const rows = new Map<string, SiloPlacement[]>();
  for (const p of placements) {
    const key = p.z.toFixed(3);
    const list = rows.get(key);
    if (list) list.push(p);
    else rows.set(key, [p]);
  }

  const parts: THREE.BufferGeometry[] = [];
  const beamW = 0.5;
  const beamH = 0.4;
  const legPair = 0.18;

  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    const z = row[0].z;
    const top = Math.max(...row.map((p) => p.topY));
    const y = top + 0.8;
    const xMin = row[0].x;
    const xMax = row[row.length - 1].x;
    const len = xMax - xMin + beamW * 2;
    const cx = (xMin + xMax) / 2;
    parts.push(boxPart(len, beamH, beamW, cx, y, z, 0, 3));

    /* a support leg pair every 4 bins, down to the bin roofs beneath */
    for (let i = 0; i < row.length; i += 4) {
      const p = row[i];
      const legTop = y - beamH / 2;
      const legBottom = p.topY;
      const legH = Math.max(0.05, legTop - legBottom);
      parts.push(boxPart(0.08, legH, 0.08, p.x, legBottom + legH / 2, z - legPair, 0, 3));
      parts.push(boxPart(0.08, legH, 0.08, p.x, legBottom + legH / 2, z + legPair, 0, 3));
    }
  }

  if (!parts.length) return null;
  return mergeParts(parts);
}

export function GroupStructures({
  group,
  placements,
}: {
  group: SiloGroupSpec;
  placements: SiloPlacement[];
}) {
  const geometry = useMemo(() => {
    if (!group.structure?.conveyors) return null;
    return buildConveyors(placements);
  }, [group, placements]);

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STRUCTURE_COLOR, roughness: 0.6, metalness: 0.5 }),
    [],
  );

  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  if (!geometry) return null;
  return (
    <mesh
      name={`structure:${group.id}:conveyors`}
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
      raycast={() => null}
    />
  );
}
