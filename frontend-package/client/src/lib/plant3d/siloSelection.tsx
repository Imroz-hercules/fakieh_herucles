/**
 * Selection proxy — a real, single `Mesh` standing in for the selected bin.
 *
 * Post-process `Outline`/`Selection` (the plan's original choice, §4.C.9)
 * cannot select ONE instance of an `InstancedMesh` — the effect operates on
 * whole objects, and every bin in a group shares one. This renders the
 * group's own BASE geometry (the same one `SiloGroupMesh` instances) as one
 * ordinary mesh at exactly the selected placement's transform, so it sits in
 * the world at the right size and place and can be given its own material —
 * today a flat placeholder tint, later the shader worker's fresnel outline
 * material — without touching the instancing.
 *
 * Deliberately NOT exported from `siloMesh.tsx`: that file is asserted
 * elsewhere (`verify-plant3d.mjs`, 'the silo mesh module still builds and
 * exports its component') to export ONLY `SiloGroupMesh`, because a second
 * runtime export there breaks Vite's Fast Refresh boundary and every edit to
 * that file would reload the whole page — losing the camera, the selection
 * and the WebGL context. A sibling module keeps that guarantee intact while
 * still living beside the geometry it renders.
 *
 * USAGE (one line, in `Plant3D.tsx` — not wired in here, that file is not
 * mine to edit):
 *
 *   {selectedPlacement && <SiloSelectionProxy placement={selectedPlacement} />}
 *
 * where `selectedPlacement` is the `SiloPlacement` for the currently
 * selected `siloNo` (e.g. `SILO_BY_NO.get(selected)`).
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { SiloPlacement } from './silos';
import { buildBaseGeometry } from './siloGeometry';

/** The one accent colour this app uses for selection — see siloShader.ts's
    own ACCENT constant, kept as a literal here since importing a value
    from siloShader.ts would pull its whole module (and this proxy renders
    even before that module has finished compiling on a hot edit). */
const ACCENT = '#22d3ee';

export function SiloSelectionProxy({ placement }: { placement: SiloPlacement }) {
  /* One geometry per (group, capacity-derived dims) pair — memoized on the
     group id, not on the placement, so re-selecting a different bin in the
     SAME group (the common case: clicking around one bank) reuses it. */
  const geometry = useMemo(
    () => buildBaseGeometry(placement.group, placement.dims),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placement.group.id],
  );

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(ACCENT),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      name="selection-proxy"
      geometry={geometry}
      material={material}
      /* Same transform `writeInstances` in siloMesh.tsx gives the selected
         bin's own slot: uniform drawScale, translated to (x, floor, z). */
      position={[placement.x, placement.floor, placement.z]}
      scale={placement.drawScale}
      /* Above the shell pass (which writes no depth and sorts back-to-front),
         so the highlight reads on top of it rather than being lost inside
         the translucent stack. */
      renderOrder={10}
      raycast={() => null}
    />
  );
}
