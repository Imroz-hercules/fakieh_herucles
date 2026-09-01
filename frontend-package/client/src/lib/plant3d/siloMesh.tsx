/**
 * The instanced silo family.
 *
 * Every bin in the plant is one surface of revolution — support, hopper, barrel,
 * roof — so each group becomes a single `LatheGeometry`. 136 bins in eleven
 * groups.
 *
 * SEEING THE LEVEL
 * ----------------
 * The bins are drawn as glass. Everything above the material surface is a
 * translucent shell you can see straight through; the contents below it are
 * solid, in the colour of whatever the bin holds; and the surface itself is a
 * real disc at the real height. That is how the plant's own SCADA screens read a
 * bin, and it is the whole reason for rendering this in 3D rather than as a
 * table — you look at the plant and you see how full it is.
 *
 * Three passes over one shared geometry, per group:
 *
 *   1. CONTENTS   opaque, depth-writing. The outer wall below the surface, plus
 *                 the support structure, which is never see-through.
 *   2. SURFACE    an opaque disc at the material surface, sized to the real
 *                 cross-section at that height — which is smaller inside a
 *                 hopper than inside the barrel.
 *   3. SHELL      translucent, drawn last, over the top of its own contents.
 *                 The empty part of the bin and its roof, with a fresnel rim so
 *                 it reads as a vessel rather than as fog.
 *
 * A single `transparent` material could not do this: everything below the level
 * has to be opaque and depth-writing, or the contents of one bin show through
 * the bin standing in front of it.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { shellColor, storageRadiusAt, type SiloGroupSpec, type SiloPlacement } from './silos';
import { fillRange, segmentsFor, siloProfile } from './siloGeometry';
import { makeContentsMaterial, makeShellMaterial, makeSurfaceMaterial } from './siloShader';

/** How much larger than the drawn bin its click target is. See pickMaterial. */
const HIT_PADDING = 1.6;

/* ------------------------------------------------------------------ */
/* One group                                                           */
/* ------------------------------------------------------------------ */

export interface SiloVisual {
  /** contents colour, applied below the material surface */
  color: THREE.Color;
  /** 0..1 height fraction of the storage space that is full */
  fill: number;
  /** 0..1 desaturation. Used for bins the plant does not monitor at all. */
  dim: number;
  /** 0..1 accent, for hover and selection */
  highlight: number;
  /**
   * 1 when the plant has actually told us what this bin holds.
   *
   * Only ten of the 131 bins carry a material code, so `color` is the neutral
   * grey for the other 121 — and the shader could not tell that grey apart from
   * a material that happens to BE grey. Everything therefore had to be tinted
   * timidly, in case it was tinting nothing. This says which is which, so the
   * ten that mean something can be coloured like they mean it.
   */
  known: number;
}

interface SiloGroupMeshProps {
  group: SiloGroupSpec;
  placements: SiloPlacement[];
  /** one entry per placement, in the same order */
  visuals: SiloVisual[];
  castShadow: boolean;
  /** false when a zone is framed and this group is not in it */
  visible: boolean;
  onHover: (siloNo: number | null) => void;
  onSelect: (siloNo: number) => void;
}

export function SiloGroupMesh({
  group,
  placements,
  visuals,
  castShadow,
  visible,
  onHover,
  onSelect,
}: SiloGroupMeshProps) {
  const solidRef = useRef<THREE.InstancedMesh>(null);
  const pickRef = useRef<THREE.InstancedMesh>(null);
  const shellRef = useRef<THREE.InstancedMesh>(null);
  const surfaceRef = useRef<THREE.InstancedMesh>(null);
  const count = placements.length;
  const dims = placements[0]?.dims;

  const geometry = useMemo(() => {
    if (!dims) return null;
    const geo = new THREE.LatheGeometry(siloProfile(dims), segmentsFor(dims.diameter));
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aFill', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('aFx', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    return geo;
  }, [dims, count]);

  const surfaceGeometry = useMemo(() => {
    if (!dims) return null;
    const geo = new THREE.CircleGeometry(1, segmentsFor(dims.diameter));
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aFx', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    return geo;
  }, [dims, count]);

  const contentsMaterial = useMemo(() => {
    if (!dims) return null;
    const [y0, y1] = fillRange(dims);
    return makeContentsMaterial(shellColor(group.shell), y0, y1, dims.hopper);
  }, [dims, group.shell]);

  const shellMaterial = useMemo(() => {
    if (!dims) return null;
    const [y0, y1] = fillRange(dims);
    return makeShellMaterial(shellColor(group.shell), y0, y1, dims.hopper);
  }, [dims, group.shell]);

  const surfaceMaterial = useMemo(() => makeSurfaceMaterial(), []);

  /*
   * An invisible, slightly larger copy of the bin, purely to be clicked.
   *
   * The floored 900-series bins project to about 23 px across at the dosing
   * zone framing — measured by projecting silo 901 through the live camera,
   * not estimated. That clears the ~20 px a control needs by nothing at all,
   * only at the widest cross-section, and only dead centre of frame. The
   * raycast used the exact visible geometry, so the target WAS those 23 px.
   *
   * colorWrite off rather than a zero alpha: the fragment still rasterises
   * either way, and this way it blends nothing and writes nothing.
   */
  const pickMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }),
    [],
  );

  /* r3f auto-disposes only what is declared as a JSX child. These are built in a
     memo and handed over as props, so nothing frees them on unmount. */
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => surfaceGeometry?.dispose(), [surfaceGeometry]);
  useEffect(() => () => contentsMaterial?.dispose(), [contentsMaterial]);
  useEffect(() => () => shellMaterial?.dispose(), [shellMaterial]);
  useEffect(() => () => surfaceMaterial.dispose(), [surfaceMaterial]);
  useEffect(() => () => pickMaterial.dispose(), [pickMaterial]);

  /*
   * Draw order, back to front.
   *
   * A transparent shell with no depth write composites in whatever order its
   * instances happen to sit in the buffer, and three sorts transparent OBJECTS,
   * not instances — so a bin at the back could paint over one at the front, and
   * the error moved around as you orbited. Sorting the instances by distance
   * fixes it exactly, and at 136 bins it costs nothing.
   *
   * The order is applied to the matrices AND to every per-instance attribute, so
   * all three passes stay in step. It is recomputed only when the camera has
   * actually moved a couple of metres.
   */
  const orderRef = useRef<number[]>([]);
  const lastCamera = useRef(new THREE.Vector3(Infinity, 0, 0));
  const boundsStale = useRef(true);

  const writeInstances = () => {
    const order = orderRef.current;
    if (!order.length || !geometry || !surfaceGeometry || !dims) return;

    /* Captured before the flag is cleared below, because the surface disc needs
       it after that point. This runs on two very different triggers — the
       placements or the readings actually changed, or the camera merely moved
       far enough to want a new back-to-front order — and only the first can
       move anything's bounds. */
    const dataChanged = boundsStale.current;
    const m = new THREE.Matrix4();
    for (const [mesh, pad] of [
      [solidRef.current, 1],
      [shellRef.current, 1],
      [pickRef.current, HIT_PADDING],
    ] as const) {
      if (!mesh) continue;
      order.forEach((src, slot) => {
        const p = placements[src];
        /* Uniform scale, applied on the instance rather than baked into the
           geometry — so `siloProfile` stays true size and the capacity checks
           keep testing real geometry rather than the compressed drawing. */
        const s = p.drawScale * pad;
        m.makeScale(s, s, s);
        m.setPosition(p.x, p.floor, p.z);
        mesh.setMatrixAt(slot, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      /* An InstancedMesh's bounding sphere comes from the geometry alone until it
         is recomputed, which would frustum-cull a whole bank the moment its first
         instance left the view. Permuting the slots cannot change the bounds, so
         this only has to happen when the placements themselves do. */
      if (boundsStale.current) mesh.computeBoundingSphere();
    }

    boundsStale.current = false;

    const surface = surfaceRef.current;
    const span = dims.hopper + dims.barrel;
    if (surface) {
      order.forEach((src, slot) => {
        const p = placements[src];
        const fill = visuals[src]?.fill ?? 0;
        if (fill <= 0.0005) {
          /* Nothing in the bin: collapse the disc rather than drawing a surface
             for material that is not there. */
          m.makeScale(0, 0, 0);
        } else {
          const h = fill * span;
          const r = storageRadiusAt(dims, h) * 0.99 * p.drawScale;
          m.makeScale(r, 1, r);
          m.setPosition(p.x, p.floor + (dims.elevation + h) * p.drawScale, p.z);
        }
        surface.setMatrixAt(slot, m);
      });
      surface.instanceMatrix.needsUpdate = true;
      /* The surface disc genuinely moves with the level, so unlike the shells its
         bounds DO change on a data refresh — but not on a camera-driven reorder,
         which only permutes slots. `dataChanged` is captured before the flag is
         cleared above, so this stays correct while skipping the recompute on the
         far more frequent of the two paths. */
      if (dataChanged) surface.computeBoundingSphere();
    }

    const col = geometry.getAttribute('aColor') as THREE.InstancedBufferAttribute;
    const fillAttr = geometry.getAttribute('aFill') as THREE.InstancedBufferAttribute;
    const fx = geometry.getAttribute('aFx') as THREE.InstancedBufferAttribute;
    const sCol = surfaceGeometry.getAttribute('aColor') as THREE.InstancedBufferAttribute;
    const sFx = surfaceGeometry.getAttribute('aFx') as THREE.InstancedBufferAttribute;
    order.forEach((src, slot) => {
      const v = visuals[src];
      if (!v) return;
      col.setXYZ(slot, v.color.r, v.color.g, v.color.b);
      sCol.setXYZ(slot, v.color.r, v.color.g, v.color.b);
      fillAttr.setX(slot, v.fill);
      fx.setXYZ(slot, v.dim, v.highlight, v.known);
      sFx.setXYZ(slot, v.dim, v.highlight, v.known);
    });
    col.needsUpdate = true;
    fillAttr.needsUpdate = true;
    fx.needsUpdate = true;
    sCol.needsUpdate = true;
    sFx.needsUpdate = true;
  };

  /** Which placement each instance slot is currently drawing. */
  const slotToPlacement = orderRef;

  useFrame((state) => {
    /* A hidden group is not being composited, so its draw order cannot be
       wrong. Sorting it is pure waste on exactly the frames where the camera is
       moving and the budget is tightest. */
    if (!visible) return;
    const cam = state.camera.position;
    if (cam.distanceToSquared(lastCamera.current) < 4) return;
    lastCamera.current.copy(cam);
    const order = placements
      .map((_, i) => i)
      .sort((a, b) => {
        const pa = placements[a];
        const pb = placements[b];
        const da = (pa.x - cam.x) ** 2 + (pa.z - cam.z) ** 2;
        const db = (pb.x - cam.x) ** 2 + (pb.z - cam.z) ** 2;
        return db - da; /* farthest first */
      });
    orderRef.current = order;
    writeInstances();
  });

  /* Data changed: rewrite in the order already established. */
  useEffect(() => {
    if (!orderRef.current.length) orderRef.current = placements.map((_, i) => i);
    boundsStale.current = true;
    writeInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, visuals, geometry, surfaceGeometry, dims]);

  if (!geometry || !surfaceGeometry || !contentsMaterial || !shellMaterial || count === 0) {
    return null;
  }

  /*
   * `instanceId` is the SLOT the renderer drew, not the bin. Since the slots are
   * reordered by distance every time the camera moves, reading `placements` with
   * it directly would select whichever bin happened to be sitting in that slot —
   * a different one after every orbit.
   */
  const pick = (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId === undefined) return null;
    const src = slotToPlacement.current[e.instanceId] ?? e.instanceId;
    return placements[src]?.siloNo ?? null;
  };

  return (
    <group visible={visible}>
      {/* 1. contents and structure — opaque, writes depth */}
      <instancedMesh
        ref={solidRef}
        args={[geometry, contentsMaterial, count]}
        receiveShadow
        raycast={() => null}
      />

      {/* 2. the material surface */}
      <instancedMesh
        ref={surfaceRef}
        args={[surfaceGeometry, surfaceMaterial, count]}
        receiveShadow
        raycast={() => null}
      />

      {/*
        3. the glass shell. It carries the pointer handlers because its geometry
        spans the whole bin, so an empty silo is just as clickable as a full one,
        and it carries the shadow because a bin should throw its whole shape on
        the ground whether or not there is anything in it.
      */}
      <instancedMesh
        ref={shellRef}
        args={[geometry, shellMaterial, count]}
        castShadow={castShadow}
        receiveShadow
        raycast={() => null}
      />

      {/* 4. the click target: invisible, padded, never drawn. */}
      <instancedMesh
        ref={pickRef}
        args={[geometry, pickMaterial, count]}
        onPointerMove={(e) => {
          e.stopPropagation();
          onHover(pick(e));
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          const no = pick(e as unknown as ThreeEvent<PointerEvent>);
          if (no !== null) onSelect(no);
        }}
      />
    </group>
  );
}
