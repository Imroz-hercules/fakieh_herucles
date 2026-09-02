/**
 * Fakieh plant — 3D shadow twin.
 *
 * A live view of all 131 monitored bins, driven by the plant's own PLC data
 * through `/api/silos`. Data flows one way, plant to screen: nothing here can
 * change plant state, which is what makes this a digital *shadow* rather than a
 * digital twin. That is the honest description and the stronger position.
 *
 * Everything is procedural geometry — a silo is a surface of revolution and a
 * building is a box — so there are no model files, no asset pipeline and nothing
 * that can silently fail on export. The route is lazy-loaded, so three.js only
 * ever reaches users who open this page.
 */
import {
  Suspense,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Sky,
  AdaptiveDpr,
  Html,
  Edges,
  Environment,
  Lightformer,
  PerformanceMonitor,
} from '@react-three/drei';
import * as THREE from 'three';
import {
  EffectComposer,
  N8AO,
  Bloom,
  Vignette,
  SMAA,
  ToneMapping,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Link } from 'wouter';
import { motion, useReducedMotion } from 'framer-motion';
import { PanelRight } from 'lucide-react';
import { WaterSystemLayout } from '../../components/water-system/WaterSystemLayout';
import {
  BUILDINGS,
  GALLERIES,
  LIGHT_MASTS,
  SITE,
  SITE_VIEW,
  ZONES,
  type SiteBuilding,
  type ZoneId,
} from '../../lib/plant3d/site';
import {
  PLATFORMS,
  SILOS,
  SILO_BY_NO,
  SILO_GROUPS,
  VERTICAL_EXAGGERATION,
  ZONE_ANCHORS,
  assertSiloModel,
  formatCapacity,
  type Bounds,
  type Platform,
  type SiloPlacement,
  type SiloGroupSpec,
} from '../../lib/plant3d/silos';
import {
  OUT_OF_SERVICE,
  materialColorIn,
  materialLabel,
  materialsPresent,
  siloLevel,
  formatPercent,
  useSiloReadings,
} from '../../lib/plant3d/siloData';
import { SiloGroupMesh, type SiloVisual } from '../../lib/plant3d/siloMesh';
import { ACCENT } from '../../lib/plant3d/siloShader';
import { SiteGround } from '../../lib/plant3d/ground';
import {
  DiagnosticsBar,
  LookBar,
  LegendDock,
  ZoneSwitch,
  type Quality,
} from '../../components/water-system/plant3d/PlantHud';
import { SiloList } from '../../components/water-system/plant3d/SiloList';
import { LOOKS, lightformersFor, type Look, type TimeOfDay } from '../../lib/plant3d/look';

/* ------------------------------------------------------------------ */
/* Look                                                                */
/* ------------------------------------------------------------------ */

/*
 * Building shells, cool and neutral.
 * 
 * These were warm sand (#cfc6b4 and friends), which put four large warm-grey
 * masses either side of the silo banks and left the whole frame in one hue.
 * The world is deliberately desaturated so that material colour is the only
 * chroma on screen; the buildings are context and belong in the neutral band.
 */
const SHELL_COLOR: Record<SiteBuilding['kind'], string> = {
  store: '#b8bdc2',
  process: '#adb3b9',
  office: '#a8b2bb',
  shed: '#b2b7bb',
};

/* ------------------------------------------------------------------ */
/* Structures                                                          */
/* ------------------------------------------------------------------ */

/** A pitched roof as an extruded triangle. roofRise = 0 renders nothing. */
function PitchedRoof({ b, color }: { b: SiteBuilding; color: string }) {
  const geometry = useMemo(() => {
    const rise = b.roofRise ?? 0;
    if (rise <= 0) return null;
    const shape = new THREE.Shape();
    shape.moveTo(-b.width / 2, 0);
    shape.lineTo(b.width / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.length, bevelEnabled: false });
    /* extrude runs along +Z; stand it up and centre it on the building */
    geo.rotateY(Math.PI / 2);
    geo.translate(-b.length / 2, 0, 0);
    geo.computeVertexNormals();
    return geo;
  }, [b.width, b.length, b.roofRise]);

  /* r3f only auto-disposes objects declared as nested JSX children. A geometry
     passed as a `geometry={...}` prop is a plain property set, so nothing frees
     it, and the see-through toggle remounts every roof. */
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[b.x, b.height, b.z]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

/*
 * A ghosted building is a CAGE, not a frosted box.
 *
 * It used to draw both sides of the box at 14% opacity in a pale warm grey, and
 * the result was a plastic display case: the NEAR wall veiled every bin behind
 * it, the far wall veiled the ground, and four of them in a row made the whole
 * site look like a model kit under glass. Two 14% surfaces between the eye and
 * a silo compound to 26% of the image being building — on the one element the
 * view exists to show.
 *
 * Rendering only the BACK faces fixes it outright. The near wall stops existing,
 * so nothing at all stands between the camera and the bins; the far wall and the
 * underside of the roof still describe the volume, and the silhouette edges
 * still say where the building is. Same trick an x-ray view uses, and it costs
 * nothing — it is one flag.
 */
const GHOST_FILL = '#63707f';
/*
 * Dim, because drei Edges ignores `side`.
 *
 * The fill is BackSide so the near wall does not exist — but `Edges` builds a
 * separate LineSegments2 from EdgesGeometry over the whole box and draws all
 * twelve edges, front ones included. So every ghosted building still rendered
 * as a complete bright cage. #8fa1b5 is 62% luminance, brighter than the ground
 * and close to the sky, so it read as a lit outline over everything; #4a5666 is
 * 34% and at a third opacity it recedes into the mid greys and merely says
 * where the shed is.
 */
const GHOST_EDGE = '#4a5666';

function Building({ b, ghosted }: { b: SiteBuilding; ghosted: boolean }) {
  const color = SHELL_COLOR[b.kind];
  return (
    <group>
      <mesh position={[b.x, b.height / 2, b.z]} castShadow={!ghosted} receiveShadow>
        <boxGeometry args={[b.length, b.height, b.width]} />
        <meshStandardMaterial
          color={ghosted ? GHOST_FILL : color}
          roughness={0.9}
          metalness={0.04}
          transparent={ghosted}
          opacity={ghosted ? 0.1 : 1}
          depthWrite={!ghosted}
          side={ghosted ? THREE.BackSide : THREE.FrontSide}
        />
        {/* With the fill this quiet, the edges are what say "building". Cool and
            dim on purpose: these are context, not the subject, and at full
            brightness they read as debug wireframe and pull the eye off the
            silos. */}
        {ghosted && <Edges threshold={15} color={GHOST_EDGE} transparent opacity={0.35} />}
      </mesh>
      {!ghosted && <PitchedRoof b={b} color={color} />}
    </group>
  );
}

/** A mezzanine slab with corner columns, so the elevated bins do not float. */
function PlatformMesh({ p }: { p: Platform }) {
  const cols: [number, number][] = [
    [p.x - p.length / 2 + 1, p.z - p.width / 2 + 1],
    [p.x + p.length / 2 - 1, p.z - p.width / 2 + 1],
    [p.x - p.length / 2 + 1, p.z + p.width / 2 - 1],
    [p.x + p.length / 2 - 1, p.z + p.width / 2 - 1],
    [p.x, p.z - p.width / 2 + 1],
    [p.x, p.z + p.width / 2 - 1],
  ];
  return (
    <group>
      <mesh position={[p.x, p.y - 0.2, p.z]} castShadow receiveShadow>
        <boxGeometry args={[p.length, 0.4, p.width]} />
        <meshStandardMaterial color="#9aa2aa" roughness={0.85} metalness={0.15} />
      </mesh>
      {cols.map(([cx, cz], i) => (
        <mesh key={i} position={[cx, (p.y - 0.4) / 2, cz]} castShadow receiveShadow>
          <boxGeometry args={[0.45, p.y - 0.4, 0.45]} />
          <meshStandardMaterial color="#868e96" roughness={0.85} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Lighting masts: a column, a head, and a point light.
 *
 * No shadow maps on these — eight shadow-casting point lights would cost six
 * cube renders each and buy nothing, because the sun already grounds everything
 * with a shadow. The emissive head is what actually reads as a lamp.
 */
function LightMasts({
  strength,
  color,
  lowPower,
}: {
  strength: number;
  color: string;
  lowPower: boolean;
}) {
  if (strength <= 0) return null;
  /* Every point light adds per-fragment cost across the whole scene. On a
     machine already falling back to the cheap path, half of them is plenty to
     keep the plant readable at night. */
  const masts = lowPower ? LIGHT_MASTS.filter((_, i) => i % 2 === 0) : LIGHT_MASTS;
  return (
    <group>
      {masts.map((m, i) => (
        <group key={i} position={[m.x, 0, m.z]}>
          <mesh position={[0, m.height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.42, m.height, 6]} />
            <meshStandardMaterial color="#3f4855" roughness={0.8} metalness={0.4} />
          </mesh>
          {/*
            A fixture, not a floating bulb.

            This was a bare emissive sphere, unlit from every direction and then
            bloomed — a glowing marble on a stick. A real yard light is a dark
            housing with a lamp under it, and the housing is what makes it read
            as equipment: it gives the head a silhouette against the sky and it
            stops the glow radiating upward out of a fitting that has a lid.
            Two extra primitives per mast, on eight masts, half of them dropped
            on the cheap path.
          */}
          <mesh position={[0, m.height + 0.75, 0]} castShadow>
            <cylinderGeometry args={[1.5, 1.05, 0.5, 8]} />
            <meshStandardMaterial color="#2c333d" roughness={0.7} metalness={0.5} />
          </mesh>
          <mesh position={[0, m.height + 0.42, 0]}>
            <cylinderGeometry args={[0.95, 0.95, 0.16, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          <pointLight
            position={[0, m.height, 0]}
            color={color}
            intensity={5200 * strength}
            distance={165}
            decay={2}
          />
        </group>
      ))}
    </group>
  );
}

/**
 * A conveyor gallery: a deck on legs, running between two points.
 *
 * Zone-filtered like the buildings are — this used to render all four
 * galleries regardless of which zone was framed, so a raised truss running
 * to a bank of silos that were hidden for this view hung in the frame
 * connected to nothing, outside the box the camera fit to. `galleryTouchesZone`
 * shows one whenever either of its two ends is near the active zone, since a
 * connector genuinely belongs to both the zone it leaves and the one it
 * feeds — never fewer galleries than actually touch this zone, but also
 * never one whose other end is nowhere in view.
 */
function Galleries({ color, zone }: { color: string; zone: ZoneId | 'all' }) {
  const shown = zone === 'all' ? GALLERIES : GALLERIES.filter((g) => galleryTouchesZone(g, zone));
  return (
    <group>
      {shown.map((g) => {
        const dx = g.to[0] - g.from[0];
        const dz = g.to[1] - g.from[1];
        const len = Math.hypot(dx, dz);
        const mx = (g.from[0] + g.to[0]) / 2;
        const mz = (g.from[1] + g.to[1]) / 2;
        const angle = Math.atan2(dz, dx);
        const legs = Math.max(2, Math.round(len / 14));
        /* Stable across the zone filter changing which subset renders —
           an index would silently rekey (and re-mount) every remaining
           gallery whenever one ahead of it drops out of the view. */
        const key = `${g.from.join(',')}->${g.to.join(',')}`;
        return (
          <group key={key} position={[mx, 0, mz]} rotation={[0, -angle, 0]}>
            <mesh position={[0, g.y + g.width / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[len, g.width, g.width]} />
              <meshStandardMaterial
                color={color}
                roughness={0.75}
                metalness={0.35}
                opacity={g.observed ? 1 : 0.75}
                transparent={!g.observed}
              />
            </mesh>
            {Array.from({ length: legs }, (_, k) => {
              const t = legs === 1 ? 0 : k / (legs - 1) - 0.5;
              return (
                <mesh key={k} position={[t * len * 0.92, g.y / 2, 0]} castShadow>
                  <boxGeometry args={[0.45, g.y, 0.45]} />
                  <meshStandardMaterial color={color} roughness={0.85} metalness={0.3} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/** The compound wall, as four thin slabs. Cheap, and it gives the site an edge. */
function PerimeterWall({ color }: { color: string }) {
  const w = SITE.wall;
  const hx = w.length / 2;
  const hz = w.width / 2;
  const runs: [number, number, number, number][] = [
    [w.x, w.z - hz, w.length, w.thickness],
    [w.x, w.z + hz, w.length, w.thickness],
    [w.x - hx, w.z, w.thickness, w.width],
    [w.x + hx, w.z, w.thickness, w.width],
  ];
  return (
    <group>
      {runs.map(([x, z, lx, lz], i) => (
        <mesh key={i} position={[x, w.height / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[lx, w.height, lz]} />
          <meshStandardMaterial color={color} roughness={0.95} metalness={0.02} />
        </mesh>
      ))}
    </group>
  );
}


/** One silo number, already placed in screen space. */
export interface SiloNumberLabel {
  siloNo: number;
  /** CSS pixels within the canvas */
  x: number;
  y: number;
}

/**
 * Works out which silo numbers can be shown without lying or colliding.
 *
 * Drawing all 131 is not an option and not what anyone wants: at whole-site
 * distance the bins are a few pixels across, so the numbers would out-size the
 * things they name, overlap into an unreadable mat, and cover the plant they
 * were meant to explain. A label nobody can read is worse than no label,
 * because it still takes the space.
 *
 * So each number has to earn its place twice.
 *
 * LEGIBILITY. A bin whose drawn diameter projects to fewer than `MIN_BIN_PX`
 * pixels does not get a number. That is a statement about the bin, not the
 * text: a number floating over something too small to look at cannot be
 * attributed to it by eye, and pointing at the wrong bin is the one failure a
 * silo label must not have.
 *
 * NO OVERLAP. What survives is sorted nearest-first and placed greedily, and
 * any label whose box would touch one already placed is dropped. Nearest-first
 * rather than by size or number, because the near bins are the ones being
 * looked at, and it keeps the choice stable as the camera moves — a
 * furthest-first rule makes labels flicker as the ordering churns.
 *
 * Positions are published to the page rather than mounted as 131 <Html>
 * nodes: drei's Html is one DOM element plus a per-frame matrix update each,
 * and this view has to hold 40 fps on an Intel Iris Xe. One absolutely
 * positioned overlay costs a fraction of that.
 */
const MIN_BIN_PX = 13;
const MAX_LABELS = 70;
const LABEL_H = 15;
const LABEL_PAD = 3;

/**
 * Collapsed height of the narrow-viewport bottom sheet, in CSS pixels.
 *
 * Must fit the 48px handle, SiloList's KPI strip, its finder row, AND at
 * least the first two bin rows — "peek shows only the KPI strip" was the
 * first cut at this and undersold it: an operator glancing at a tablet
 * should see the top of the alarm-sorted list without having to drag the
 * sheet open first. Generous rather than exact, since a coarse pointer
 * pushes every row and the finder to the 44px touch-target floor. Measured
 * against a real screenshot at 1024x768: 288px left the second row only
 * about 70% visible, cropped mid-badge — bumped to keep it whole.
 */
const SHEET_PEEK = 320;

function SiloNumberProjector({
  placements,
  onLayout,
  insetTop,
  insetBottom,
}: {
  placements: SiloPlacement[];
  onLayout: (labels: SiloNumberLabel[]) => void;
  /* The bands the HUD cards occupy, measured from the cards themselves — the
     same numbers the camera fit uses. A label is not allowed into them. */
  insetTop: number;
  insetBottom: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  /* Recomputed only when the view actually changed. Re-projecting 131 points
     is cheap; handing React a new array 60 times a second is not. */
  const lastKey = useRef('');

  useFrame(() => {
    const key =
      `${camera.position.toArray().map((n) => n.toFixed(2)).join()}|`
      + `${camera.quaternion.toArray().map((n) => n.toFixed(3)).join()}|`
      + `${size.width}x${size.height}|${placements.length}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    const tanHalfFov = Math.tan((camera.fov * Math.PI) / 360);
    const candidates: (SiloNumberLabel & { dist: number; w: number })[] = [];

    for (const p of placements) {
      /* Just above the roof, in WORLD space — the scene group scales Y by
         VERTICAL_EXAGGERATION, so a model-space height would sit inside the
         bin on every silo taller than a few metres. */
      scratch.set(p.x, (p.topY + 0.6) * VERTICAL_EXAGGERATION, p.z);
      const dist = scratch.distanceTo(camera.position);
      scratch.project(camera);
      /* z > 1 is behind the camera; projecting it gives a mirrored point that
         lands somewhere plausible on screen and labels the wrong place. */
      if (scratch.z > 1) continue;

      const x = (scratch.x * 0.5 + 0.5) * size.width;
      const y = (-scratch.y * 0.5 + 0.5) * size.height;
      if (x < 0 || y < 0 || x > size.width || y > size.height) continue;

      const drawnDiameter = p.dims.diameter * p.drawScale;
      const binPx = (drawnDiameter / (2 * dist * tanHalfFov)) * size.height;
      if (binPx < MIN_BIN_PX) continue;

      candidates.push({
        siloNo: p.siloNo,
        x,
        y,
        dist,
        w: 11 + 7 * String(p.siloNo).length,
      });
    }

    candidates.sort((a, b) => a.dist - b.dist);

    /*
     * A label that collides is nudged up before it is given up on.
     *
     * The first version placed every number directly over its own roof and
     * dropped anything that clashed, which on a tight bank meant most of them:
     * 6 labels for 22 bins in the raw battery. In a row of near-identical silos
     * the ones you most want numbered are exactly the ones packed together, so
     * dropping on first collision fails hardest where it matters most.
     *
     * The ladder is small and strictly vertical. Vertical because these bins
     * are tall and narrow, so there is empty sky above a roof and a neighbour
     * beside it; small because a number that has wandered far from its bin
     * stops being attributable, and a wrong attribution is worse than no
     * label at all. Four rungs at 15px is about one bin's roof height.
     */
    /*
     * Up first, then DOWN onto the bin itself.
     *
     * Upward-only was the first version and it produced zero labels on the raw
     * battery: those roofs sit directly under the top HUD band, so every rung
     * of the ladder landed in the cards and every candidate was rejected. The
     * view that most needs numbering got none at all.
     *
     * Downward rungs put the number on the silo's own body instead of in the
     * sky above it. That is not a compromise — it is arguably better, because
     * a number ON a bin cannot be misread as belonging to its neighbour, which
     * is the one failure a silo label must not have.
     */
    const RUNGS = [0, -15, 15, -30, 30, 45, 60];
    const placed: (SiloNumberLabel & { w: number })[] = [];
    for (const c of candidates) {
      if (placed.length >= MAX_LABELS) break;
      for (const dy of RUNGS) {
        const y = c.y + dy;
        /*
         * Never into the HUD's bands. The ladder above nudges a colliding
         * label upward, and upward is exactly where the cards are: the first
         * version pushed numbers behind the zone tabs, so a bin ended up
         * labelled by something the operator could not read. Clamping to the
         * canvas edge was not enough — the edge is not where the picture
         * starts. These are the same insets the camera frames against, so a
         * label lives in the same clear band the plant does.
         */
        if (y < insetTop + LABEL_H || y > size.height - insetBottom - LABEL_H) continue;
        const clash = placed.some(
          (o) =>
            Math.abs(o.x - c.x) < (o.w + c.w) / 2 + LABEL_PAD
            && Math.abs(o.y - y) < LABEL_H + LABEL_PAD,
        );
        if (!clash) {
          placed.push({ siloNo: c.siloNo, x: c.x, y, w: c.w });
          break;
        }
      }
    }

    onLayout(placed.map(({ siloNo, x, y }) => ({ siloNo, x, y })));
  });

  return null;
}

/** Ring on the floor and a marker above, so a selected bin is findable in a bank. */
function SelectionMarker({ p }: { p: SiloPlacement }) {
  /* The drawn size, not the physical one. The indoor bins are drawn compressed
     up to ~3x, so a ring sized off `dims` sits inside a micro hopper instead of
     around it, and the beam starts below its own roof. */
  const r = (p.dims.diameter * p.drawScale) / 2;
  const beam = Math.max(3, p.dims.total * p.drawScale * 0.4);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[p.x, p.floor + 0.06, p.z]}>
        <ringGeometry args={[r * 1.25, r * 1.7, 44]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={1} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[p.x, p.topY + beam / 2 + r * 0.4, p.z]}>
        <cylinderGeometry args={[Math.max(0.05, r * 0.09), Math.max(0.05, r * 0.09), beam, 8]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** What the cursor is over, said mostly in colour and length rather than words. */
export interface HoverInfo {
  siloNo: number;
  material: string;
  color: string;
  /** 0..1 of capacity, clamped for the bar; null when there is no level to show */
  fill: number | null;
  pct: string;
  hl: boolean;
  lock: boolean;
}

function HoverChip({ siloNo, material, color, fill, pct, hl, lock }: HoverInfo) {
  return (
    <div className="w-36 rounded-md bg-slate-950/95 px-2 py-1.5 shadow-xl ring-1 ring-cyan-400/40">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-sm font-semibold leading-none text-white">{siloNo}</span>
        <span className="ml-auto font-mono text-[11px] leading-none text-cyan-300">{pct}</span>
        {hl && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="High level" />}
        {lock && <span className="h-1.5 w-1.5 rounded-full bg-red-400" title="Locked" />}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-slate-800">
        {/*
          A minimum bar width would be a lie here: `siloLevel` clamps a negative
          reading to zero fill, and a 2% stub next to it reads as "a little bit
          in there" when the bin is empty or the scale has drifted below zero.
        */}
        {fill !== null && fill > 0 && (
          <div
            className="h-full rounded-sm"
            style={{
              width: `${Math.max(1.5, Math.min(100, fill * 100))}%`,
              backgroundColor: color,
            }}
          />
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
        <span className="truncate text-[10px] leading-none text-slate-300">{material}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/**
 * Distance at which a SET of axis-aligned boxes exactly fills the frame.
 *
 * Projects every corner of every box onto the camera's own axes and takes the
 * furthest back any of them forces the camera to sit. A bounding *sphere*
 * would be simpler but pushes the camera much too far away for a site like
 * this one, which is 280 m long and 40 m tall — the empty sky above it would
 * take half the screen. This is aspect-aware, so the same code frames a wide
 * short laptop viewport and a tall one correctly.
 *
 * Takes a LIST of small boxes — one per silo — rather than one box around the
 * whole cluster. A single box's 8 corners are only as tight as its own
 * bloat lets them be: `ZONE_BOUNDS` (silos.ts) pads every silo's own edge by
 * a flat 6 m (3 m for dosing) so its corners clear the mill wall and its
 * neighbours, then unions the result into one rectangle. On a dense, wide
 * cluster that pad is noise. On a compact one it is not: measured on the
 * raw-material zone, the padded box was 56% deeper (Z) and 21% taller (Y)
 * than the 22 silos actually drawn inside it — and because a perspective
 * camera shares one distance across both screen axes, that padding in a
 * losing direction still pushed the camera back and shrank the bins in the
 * WINNING one. Fitting to each silo's own corners removes that bloat without
 * touching `ZONE_BOUNDS` itself, which other code still uses for labels and
 * anchors. It also fixes a second, sharper failure on multi-cluster zones
 * (the outdoor yard's three separate banks): a single box's corner can sit at
 * a point no silo actually occupies — the box's own max-X paired with a
 * DIFFERENT cluster's max-Z — inflating distance for a subject that was
 * never that large on either axis at once. A per-silo corner is never a
 * phantom point; every one of them is a corner of a bin that is really there.
 */
function fitToBounds(
  boxes: Bounds[],
  dir: THREE.Vector3,
  fovDeg: number,
  aspect: number,
  /** fraction of the canvas height hidden behind the top and bottom cards */
  insetTop = 0,
  insetBottom = 0,
): { target: THREE.Vector3; position: THREE.Vector3 } {
  /* The envelope of every box, for the look-at centre and the "aim a little
     below the middle" target.y below — NOT for the distance fit, which reads
     every box's own corners individually further down. */
  const envMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const envMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) {
    for (let i = 0; i < 3; i += 1) {
      envMin[i] = Math.min(envMin[i], b.min[i]);
      envMax[i] = Math.max(envMax[i], b.max[i]);
    }
  }
  const centre = new THREE.Vector3(
    (envMin[0] + envMax[0]) / 2,
    (envMin[1] + envMax[1]) / 2,
    (envMin[2] + envMax[2]) / 2,
  );
  const tanV = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const tanH = tanV * Math.max(aspect, 0.2);

  /*
   * Frame into the part of the canvas that is actually visible — but only part
   * of the way.
   *
   * Reserving the cards' full height was costing 40% of the frame on a 326px
   * canvas, and it showed: the site spanned 48% of the width with sky above it
   * and bare ground below. Measured, not guessed.
   *
   * The cards do not span the canvas. They sit in the corners, and the plant is
   * long and thin, so most of it passes through the gap between them quite
   * happily. Reserving about half their height is the honest trade — the middle
   * of the plant stays clear of the status card, and the picture is half again
   * as large.
   */
  /* Asymmetric: the top carries two stacked cards AND the zone markers hang
     above the silos, so it needs the clearance. The bottom has one short card. */
  /*
   * The comment above says "reserving about half their height". These numbers
   * did not do that — 0.8 is nearly the full reservation, and at the measured
   * overlay footprint it was giving away 26-30% of the vertical frame on a
   * 400 px canvas. Height is the binding constraint in every view here, and a
   * perspective camera shares one distance across both axes, so the cost was
   * never only vertical: relaxing it to an actual half takes the whole-site
   * view from 68% to 82% of the frame width.
   */
  const RESERVE_TOP = 0.4;
  const RESERVE_BOTTOM = 0.175;
  const clear = Math.max(
    0.68,
    1 - insetTop * RESERVE_TOP - insetBottom * RESERVE_BOTTOM,
  );
  const tanVClear = tanV * clear;

  const view = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(view, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, view).normalize();

  const corner = new THREE.Vector3();
  let d = 0;
  for (const b of boxes) {
    for (let i = 0; i < 8; i += 1) {
      corner
        .set(i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2])
        .sub(centre);
      const along = corner.dot(dir);
      d = Math.max(d, along + Math.abs(corner.dot(right)) / tanH);
      d = Math.max(d, along + Math.abs(corner.dot(up)) / tanVClear);
    }
  }

  /* Aim a little below the middle: bins are read from the side, and a target at
     the exact centre of the box leaves the ground crowded against the bottom. */
  const target = centre.clone();
  target.y = envMin[1] + (envMax[1] - envMin[1]) * 0.38;

  const distance = d * 1.0;
  /* Slide the whole framing along the camera's own up axis so the clear band,
     not the canvas centre, is what the plant sits in the middle of. */
  const shift =
    ((insetTop * RESERVE_TOP - insetBottom * RESERVE_BOTTOM) / 2) * distance * tanV * 2;
  target.addScaledVector(up, shift);
  return { target, position: target.clone().addScaledVector(dir, distance) };
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * One silo's own tight, drawn world-space box — the input `fitToBounds` now
 * fits to, in place of the flat-padded `ZONE_BOUNDS`/`SITE_BOUNDS` rectangle.
 *
 * `pad` is small on purpose (metres, not the 6 m/3 m `ZONE_BOUNDS` used):
 * this is breathing room around one bin, not clearance for a whole cluster.
 * X/Z are true metres — the exaggeration group never scales them. Y matches
 * `drawnBounds`: scaled by VERTICAL_EXAGGERATION, same as every other height
 * in the scene, so the fit lines up with what is actually drawn.
 */
function siloFitBox(p: SiloPlacement, pad = 1): Bounds {
  const r = (p.dims.diameter * p.drawScale) / 2 + pad;
  /* A couple of metres below the floor, so an elevated group — dosing stands
     on a deck 10 m up — still shows the edge of the slab it sits on for
     context, the same intent `ZONE_BOUNDS`'s own floorMargin served. Harmless
     no-op for the ground-level groups, since floor is already 0 there. */
  const y0 = Math.max(0, p.floor - 2) * VERTICAL_EXAGGERATION;
  const y1 = (p.topY + pad) * VERTICAL_EXAGGERATION;
  return { min: [p.x - r, y0, p.z - r], max: [p.x + r, y1, p.z + r] };
}

function siloFitBoxes(placements: SiloPlacement[], pad = 1): Bounds[] {
  return placements.map((p) => siloFitBox(p, pad));
}

/**
 * Eases the camera to a zone's framing and then gets out of the way.
 *
 * The animation is abandoned the moment the user touches the controls, so it can
 * never fight a drag — an animated camera that keeps pulling back is the fastest
 * way to make a 3D view feel broken.
 */
interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

function CameraRig({
  bounds,
  dir,
  insetTop,
  insetBottom,
}: {
  bounds: Bounds[];
  dir: [number, number, number];
  insetTop: number;
  insetBottom: number;
}) {
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const active = useRef(false);
  const first = useRef(true);

  const framing = useMemo(
    () =>
      fitToBounds(
        bounds,
        new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(),
        camera.fov ?? 42,
        size.width / Math.max(size.height, 1),
        insetTop / Math.max(size.height, 1),
        insetBottom / Math.max(size.height, 1),
      ),
    [bounds, dir, camera.fov, size.width, size.height, insetTop, insetBottom],
  );

  /*
   * Dev-only handle so the INTENDED target/position — what fitToBounds
   * actually computed this render — can be read back and compared against
   * the live camera, the same way __plant3d already exposes the render
   * state for measurement.
   *
   * This is what caught the real shape of the "off-centre" defect: the
   * camera's easing is frame-count-driven (each rendered frame closes a
   * fraction of the remaining gap; see CameraRig's useFrame below), and
   * under this project's own headless SwiftShader harness rAF runs at
   * roughly 0.5 fps — so a fixed real-time sleep, the pattern
   * scripts/shoot-plant3d.mjs uses, catches the camera mid-transition, tens
   * of metres from where fitToBounds actually aimed it. Comparing this
   * against camera.position is how a screenshot taken too early gets told
   * apart from a real fit bug, and it stays cheap and stripped from
   * production, so it is worth keeping rather than deleting after one use.
   */
  if (import.meta.env.DEV) {
    (window as unknown as { __plant3dFraming?: unknown }).__plant3dFraming = {
      target: framing.target.toArray(),
      position: framing.position.toArray(),
      bounds,
      dir,
      insetTop,
      insetBottom,
      sizeWidth: size.width,
      sizeHeight: size.height,
      fov: camera.fov,
    };
  }

  useEffect(() => {
    active.current = true;
  }, [framing]);

  useEffect(() => {
    if (!controls) return undefined;
    const stop = () => {
      active.current = false;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    if (!active.current || !controls) return;
    /* Snap on the very first frame rather than flying in from the initial
       camera prop, which would otherwise read as a stray animation on load. */
    const k = first.current ? 1 : 1 - Math.pow(0.002, Math.min(dt, 0.05));
    first.current = false;
    controls.target.lerp(framing.target, k);
    camera.position.lerp(framing.position, k);
    controls.update();
    if (
      camera.position.distanceTo(framing.position) < 0.5 &&
      controls.target.distanceTo(framing.target) < 0.3
    ) {
      active.current = false;
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Instrumentation — measure, do not assume                            */
/* ------------------------------------------------------------------ */

/**
 * Writes fps / draw calls / triangles straight into a DOM node.
 *
 * Deliberately not React state: this samples twice a second, and putting that
 * through setState would re-render the whole page — including the Canvas
 * subtree — just to update three numbers.
 */
function StatsProbe({ target }: { target: React.RefObject<HTMLSpanElement> }) {
  const { gl } = useThree();
  const frames = useRef(0);
  const last = useRef(performance.now());

  /*
   * Count the whole frame, not the last pass of it.
   *
   * three clears `info.render` at the top of every `renderer.render()` call.
   * That is fine while r3f draws the scene once per frame, and wrong the moment
   * the EffectComposer is in the chain: the composer renders the scene into a
   * target and then draws a full-screen quad for each effect, so by the time
   * anything reads the counters they hold the last quad and nothing else. The
   * panel read "1 draw · 1 tri" for a scene drawing 83 — a number that looks
   * like a triumph and means the meter is broken.
   *
   * Turning `autoReset` off and clearing the counters here instead makes them
   * accumulate across every pass. This callback has the default priority of 0,
   * and the composer subscribes at 1; r3f runs subscriptions in ascending
   * priority, so the reset always lands before the first render of the frame
   * and the value read is the completed previous frame.
   */
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    const dt = now - last.current;
    if (dt >= 500) {
      const fps = Math.round((frames.current * 1000) / dt);
      const el = target.current;
      if (el) {
        el.textContent = `${fps} fps · ${gl.info.render.calls} draws · ${gl.info.render.triangles.toLocaleString()} tris`;
      }
      frames.current = 0;
      last.current = now;
    }
    gl.info.reset();
  });
  return null;
}

/**
 * The generated environment map.
 *
 * This is the single biggest thing separating "3D shapes under a lamp" from
 * "metal outdoors". Every silo used to be lit by one directional light plus a
 * flat hemisphere, so a curved steel wall had nothing to reflect and shaded as a
 * smooth grey gradient — the reason the whole site read as dull plastic. Giving
 * the scene a sky to reflect costs one 128px cubemap, baked ONCE, and every
 * curved surface in the plant gains a horizon, a bright side and a bounce.
 *
 * Built from lightformers rather than a downloaded HDR: nothing to fetch,
 * nothing to cache, and it follows the time of day.
 *
 * Memoised on the look, because drei re-bakes all six cubemap faces whenever its
 * `children` identity changes — and inline children inside `Scene` change on
 * every hover and every data refresh. Baking a cubemap on mouse-move is not free.
 */
const SiteEnvironment = memo(function SiteEnvironment({ look }: { look: Look }) {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={look.envIntensity}>
      {/* Sky dome, sun, ground bounce and a cool back rim — as data, in
          `look.ts`, so the whole rig for a time of day lives in one place next
          to the fog and the sun that have to agree with it. */}
      {lightformersFor(look).map((lf) => (
        <Lightformer
          key={lf.key}
          form={lf.form}
          intensity={lf.intensity}
          color={lf.color}
          scale={lf.scale}
          position={lf.position}
          rotation={lf.rotation}
          target={lf.target}
        />
      ))}
    </Environment>
  );
});

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

interface GroupBucket {
  spec: (typeof SILO_GROUPS)[number];
  placements: SiloPlacement[];
}

const BUCKETS: GroupBucket[] = SILO_GROUPS.map((spec) => ({
  spec,
  placements: SILOS.filter((s) => s.group.id === spec.id),
}));

/**
 * Each zone's own silo footprint in X/Z, computed once. Used only to decide
 * which conveyor galleries are relevant to a zone view — see `Galleries`
 * below — never to fit the camera; the camera fits to `siloFitBoxes` (and,
 * for a visible gallery, that gallery's own box) directly.
 */
const ZONE_FOOTPRINT: Record<ZoneId, { minX: number; maxX: number; minZ: number; maxZ: number }> =
  (() => {
    const out = {} as Record<ZoneId, { minX: number; maxX: number; minZ: number; maxZ: number }>;
    for (const z of ZONES) {
      const ps = SILOS.filter((s) => s.group.zone === z.id);
      out[z.id] = {
        minX: Math.min(...ps.map((p) => p.x)),
        maxX: Math.max(...ps.map((p) => p.x)),
        minZ: Math.min(...ps.map((p) => p.z)),
        maxZ: Math.max(...ps.map((p) => p.z)),
      };
    }
    return out;
  })();

/**
 * Slack around a zone's own silo footprint before a gallery endpoint counts
 * as touching it. Gallery endpoints are traced from imagery to within a few
 * metres (site.ts), and a conveyor plausibly lands anywhere along a group's
 * own edge, not dead centre on a silo — so this is generous on purpose.
 */
const GALLERY_ZONE_MARGIN = 12;

/**
 * A gallery is a CONNECTOR between two areas, not a resident of one zone —
 * `Gallery` (site.ts) carries no `zone` field, deliberately: a conveyor from
 * the outdoor bank to the mill is meaningful in both the yard view and the
 * raw-material view it feeds. So it counts as relevant to a zone when EITHER
 * end falls near that zone's own silo footprint.
 */
function galleryTouchesZone(g: (typeof GALLERIES)[number], zoneId: ZoneId): boolean {
  const fp = ZONE_FOOTPRINT[zoneId];
  const near = (x: number, z: number) =>
    x >= fp.minX - GALLERY_ZONE_MARGIN &&
    x <= fp.maxX + GALLERY_ZONE_MARGIN &&
    z >= fp.minZ - GALLERY_ZONE_MARGIN &&
    z <= fp.maxZ + GALLERY_ZONE_MARGIN;
  return near(g.from[0], g.from[1]) || near(g.to[0], g.to[1]);
}

/**
 * A visible gallery's own drawn world-space box — but only the DECK, from
 * `g.y` to `g.y + g.width`, not the legs down to the ground.
 *
 * Measured first at the ground: fitting the full leg run (0 to g.y) dragged
 * every zone the gallery touches down to y=0 in the box, and on an elevated
 * one — dosing sits on a deck 10 m up — that cost far more than it bought:
 * dosing's fill dropped from 46.4%/38.8% (width/height) to 33.0%/28.3% for a
 * pair of 0.45 m support legs nobody is looking at. The deck is the part the
 * coordinator's finding was actually about — "a large raised diagonal truss
 * ... hanging in the frame attached to nothing" — and it alone is what has
 * to land inside the fitted view; a leg clipped at the very bottom of an
 * elevated zone's frame is a far smaller sin than that. X/Z keep a little
 * slack for the deck's own cross-section. Y is exaggerated, same as every
 * other height in the scene — galleries sit inside the same scaled group
 * `Galleries` renders into.
 */
/**
 * Slack for CLIPPING a gallery into a zone's fit — separate from, and much
 * tighter than, GALLERY_ZONE_MARGIN (which decides whether it renders at
 * all). Measured why the two have to differ: fitting a connector's FULL run
 * for Finished Feed (48 bins, the plant's biggest zone) pulled the frame back
 * enough to take verify:picture's coverage from 18.16% to 6.2% — the far end,
 * reaching toward the buffer zone it also serves, is not part of what makes
 * this a Finished Feed view. This is the number of metres past a zone's own
 * footprint that still counts; past it, the gallery keeps rendering (so it
 * reads as leaving the frame toward its other end, not cut off mid-span) but
 * stops pulling the camera back to cover ground with no bins on it.
 */
const GALLERY_FIT_MARGIN = 2;

function galleryFitBox(
  g: (typeof GALLERIES)[number],
  /** the zone this box is being fit for, or null for the whole-site view,
      where nothing needs clipping because every gallery is already within
      the site's own envelope. */
  zoneFp: { minX: number; maxX: number; minZ: number; maxZ: number } | null,
  pad = 1,
): Bounds {
  const rawMinX = Math.min(g.from[0], g.to[0]) - g.width - pad;
  const rawMaxX = Math.max(g.from[0], g.to[0]) + g.width + pad;
  const rawMinZ = Math.min(g.from[1], g.to[1]) - g.width - pad;
  const rawMaxZ = Math.max(g.from[1], g.to[1]) + g.width + pad;
  let minX = zoneFp ? Math.max(rawMinX, zoneFp.minX - GALLERY_FIT_MARGIN) : rawMinX;
  let maxX = zoneFp ? Math.min(rawMaxX, zoneFp.maxX + GALLERY_FIT_MARGIN) : rawMaxX;
  let minZ = zoneFp ? Math.max(rawMinZ, zoneFp.minZ - GALLERY_FIT_MARGIN) : rawMinZ;
  let maxZ = zoneFp ? Math.min(rawMaxZ, zoneFp.maxZ + GALLERY_FIT_MARGIN) : rawMaxZ;
  /* GALLERY_FIT_MARGIN is deliberately tighter than the (much looser)
     GALLERY_ZONE_MARGIN that decided this gallery renders here at all — so a
     gallery whose NEAR end still sits outside the clip margin produces an
     inverted (empty) range above. Fall back to its raw, unclipped extent on
     that axis rather than emit a negative-volume box: better an un-tightened
     fit than a broken one. */
  if (minX > maxX) { minX = rawMinX; maxX = rawMaxX; }
  if (minZ > maxZ) { minZ = rawMinZ; maxZ = rawMaxZ; }
  return {
    min: [minX, g.y * VERTICAL_EXAGGERATION, minZ],
    max: [maxX, (g.y + g.width) * VERTICAL_EXAGGERATION, maxZ],
  };
}

/**
 * A mezzanine platform's own drawn box — the slab itself (0.4 m thick, see
 * `PlatformMesh`), not the corner columns down to the ground. Same reasoning
 * as `galleryFitBox`: the slab is the large flat structure a viewer actually
 * sees; fitting the columns too would drag an elevated zone's frame back
 * down toward y=0 for four 0.45 m posts, which is exactly the regression
 * measured and reverted on the gallery legs.
 */
function platformFitBox(p: Platform, pad = 1): Bounds {
  const hx = p.length / 2 + pad;
  const hz = p.width / 2 + pad;
  return {
    min: [p.x - hx, (p.y - 0.4) * VERTICAL_EXAGGERATION, p.z - hz],
    max: [p.x + hx, p.y * VERTICAL_EXAGGERATION, p.z + hz],
  };
}

/**
 * Is this group part of the picture when `zone` is selected?
 *
 * Two ways to belong. A group belongs to the zone it IS — its `zone` field,
 * which says what its bins hold. And a group belongs to a zone it STANDS IN:
 * if it names a `building` and that building is the one this zone occupies,
 * then it is physically in the room the operator is looking at, and hiding it
 * would draw the room with a hole in it.
 *
 * The second rule exists because the 400 series was asked to stand in front of
 * the 300 battery. It is mineral, so it is grouped under Minerals & Micro; it
 * stands in mill-a, which is the raw material building. Under the old
 * zone-only rule the raw view hid it — so the bins had been moved in front of
 * the 300s and could not be seen from the one view of the 300s. Being in the
 * room is a good enough reason to be drawn.
 */
function groupInZone(spec: SiloGroupSpec, zone: ZoneId | 'all'): boolean {
  if (zone === 'all') return true;
  if (spec.zone === zone) return true;
  if (!spec.building) return false;
  return BUILDINGS.some((b) => b.id === spec.building && b.zone === zone);
}

function Scene({
  look,
  ghosted,
  zone,
  lowPower,
  statsRef,
  visuals,
  selected,
  hovered,
  onHover,
  onSelect,
  onZone,
  labelFor,
  zoneTonnes,
  framing,
  insetTop,
  insetBottom,
  showNumbers,
  onNumberLayout,
}: {
  look: Look;
  ghosted: boolean;
  zone: ZoneId | 'all';
  lowPower: boolean;
  statsRef: React.RefObject<HTMLSpanElement>;
  visuals: SiloVisual[][];
  selected: number | null;
  hovered: number | null;
  onHover: (n: number | null) => void;
  onSelect: (n: number) => void;
  onZone: (z: ZoneId) => void;
  labelFor: (no: number) => HoverInfo;
  zoneTonnes: Record<string, number | null>;
  showNumbers: boolean;
  onNumberLayout: (labels: SiloNumberLabel[]) => void;
  framing: { bounds: Bounds[]; dir: [number, number, number] };
  insetTop: number;
  insetBottom: number;
}) {
  const selectedPlacement = selected !== null ? SILO_BY_NO.get(selected) : undefined;
  const hoveredPlacement = hovered !== null ? SILO_BY_NO.get(hovered) : undefined;

  return (
    <>
      <color attach="background" args={[look.fog]} />
      <fog attach="fog" args={[look.fog, look.fogNear, look.fogFar]} />

      <SiteEnvironment look={look} />

      {/* The environment now supplies most of the ambient, so these come down
          hard — left as they were, everything washed out to a flat pale grey. */}
      <hemisphereLight args={[look.skyColor, look.groundColor, look.ambient * 0.7]} />
      <directionalLight
        position={look.sunPosition}
        intensity={look.sunIntensity}
        color={look.sunColor}
        castShadow={!lowPower}
        shadow-mapSize={lowPower ? [512, 512] : [2048, 2048]}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-camera-far={560}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />

      {/*
        Sky distance must sit INSIDE the camera's far plane.
        drei's default is 45000 and this camera's far is 2400, so the sky sphere
        was being clipped away entirely — every "sky" in this scene until now was
        the flat background colour showing through, which is exactly why no
        amount of turbidity or rayleigh tuning changed anything.
      */}
      <Sky
        distance={1800}
        sunPosition={look.skySunPosition ?? look.sunPosition}
        turbidity={look.skyTurbidity}
        rayleigh={look.skyRayleigh}
      />

      <SiteGround ground={look.ground} yard={look.yard} road={look.road} fog={look.fog} />

      {/*
        The 10 m survey grid that used to be drawn here is gone.

        Across a 340 m site it is 34 by 19 grey lines laid over everything, and
        it is most of what made the view read as a CAD plan rather than as a
        plant — a drawing of a site instead of the site. It was there to give a
        sense of distance, which the ground now does honestly: slab seams, lane
        markings and the yard edge are things a person on that yard would
        actually see, and they say the same thing about scale.
      */}

      {/*
        Everything that stands up is stretched vertically together, so relative
        heights stay true and only the site's proportions change. The ground and
        the roads are flat and stay outside — scaling zero by anything is zero,
        but keeping them out makes the intent obvious.
      */}
      <group scale={[1, VERTICAL_EXAGGERATION, 1]}>
      <PerimeterWall color={look.yard} />
      <Galleries color="#8d949c" zone={zone} />
      <LightMasts strength={look.mast} color={look.mastColor} lowPower={lowPower} />

      {/*
        In see-through mode, a building with no bins in it is not shown at all.

        The offices are the only shell with no `zone`. Ghosting them put an empty
        glass box in the yard advertising contents it does not have; drawing them
        solid instead made them the one opaque object in an otherwise transparent
        scene, and being nearest the camera they became the brightest thing in
        the frame — still the first place the eye lands, still not a silo.

        See-through mode is the "show me the bins" mode. A shell with nothing in
        it has no part in that, and it comes back the moment the buildings are
        made solid again.
      */}
      {BUILDINGS.filter(
        (b) => (zone === 'all' || !b.zone || b.zone === zone) && !(ghosted && !b.zone),
      ).map((b) => (
        <Building
          key={b.id}
          b={b}
          /* Picking a zone is a request to look inside it, so its shell always
             goes see-through regardless of the global toggle. */
          /*
           * Only ghost a building that has something to reveal.
           *
           * Ghosting is a promise: it says "there is something inside worth
           * seeing". The offices are the one shell with no `zone`, so no bin is
           * ever drawn inside them — and they were being ghosted anyway, which
           * put a large, empty, bright-edged glass box in the yard. Worse, it
           * sits at z = 84 while the silo banks sit around z = -4 to -16, so
           * perspective made the smallest building on the site the LARGEST
           * object in the default frame. The first thing the eye landed on was
           * a container advertising contents it did not have, and it read as a
           * debug bounding box left behind.
           */
          ghosted={!!b.zone && (ghosted || (zone !== 'all' && b.zone === zone))}
        />
      ))}

      {/*
        Zone-filtered like the buildings are — this used to render every
        mezzanine regardless of which zone was framed, so viewing the raw
        material zone also drew the dosing floor and the buffer floor sitting
        off camera. Harmless clutter for a distant platform, but the same gap
        as the galleries had: a platform's own fitted-in view never accounted
        for a DIFFERENT zone's slab appearing in it, and — see
        `platformFitBox` — the zone whose own platform this is fits it in on
        purpose, so its silos never end up dwarfed by their own deck.
      */}
      {PLATFORMS.filter((p) => zone === 'all' || p.zone === zone).map((p) => (
        <PlatformMesh key={p.id} p={p} />
      ))}

      {/* Only the bins actually on screen are candidates — a hidden zone's
          silos would otherwise be projected and take up label slots that the
          visible ones need. */}
      {showNumbers && (
        <SiloNumberProjector
          placements={SILOS.filter((p) => groupInZone(p.group, zone))}
          onLayout={onNumberLayout}
          insetTop={insetTop}
          insetBottom={insetBottom}
        />
      )}

      {BUCKETS.map((bucket, i) => (
        <SiloGroupMesh
          key={bucket.spec.id}
          group={bucket.spec}
          placements={bucket.placements}
          visuals={visuals[i]}
          castShadow={!lowPower}
          /*
           * Framing a zone hides the rest of the plant rather than dimming it.
           * Dimming was tried first: the 30 m outdoor bank sits between the
           * camera and the raw material battery, and a dark silo blocks the view
           * exactly as well as a bright one does.
           */
          visible={groupInZone(bucket.spec, zone)}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}

      {selectedPlacement && (
        <>
          <SelectionMarker p={selectedPlacement} />
          {/* A ring on the floor is invisible in a packed bank seen from above.
              The number is what actually says "this one". */}
          <Html
            position={[selectedPlacement.x, selectedPlacement.topY + 2.2, selectedPlacement.z]}
            center
            zIndexRange={[10, 0]}
            pointerEvents="none"
          >
            <div className="whitespace-nowrap rounded bg-cyan-500 px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-slate-950 shadow-lg ring-1 ring-white/40">
              {selectedPlacement.siloNo}
            </div>
          </Html>
        </>
      )}

      {/*
        These used to always float in the scene — five zone markers zoomed
        out, one group label per bucket zoomed in — positioned above the
        tallest thing they name with no idea where the HUD's own cards are.
        Framing the actual subject instead of a padded box (see fitToBounds)
        means that "tallest thing" now sits much closer to the top of a
        965x326 frame than it used to, and the two collided: shots/laptop/
        01-site-day.png and 02-site-dusk.png showed "Yard" and "Raw" partly
        under the status card, "Dosing" and "Finished" clipped by it. There
        is no screen-space collision test anywhere in this file, and the
        zone pills along the top already name every zone with its tonnage
        and count — the in-scene labels were mostly repeating the one thing
        the HUD does not show (roughly where a zone sits on the plant) while
        risking exactly this on the thing the HUD also does not show: the
        plant itself.

        So they are gated on the same hover/select state the per-bin chip
        already uses, rather than always on: a label appears only for the
        zone or group a hovered or selected BIN belongs to. Nothing renders
        in the reference screenshots, where nothing is hovered or selected,
        which is what "no label may be clipped" needs to be true regardless
        of where a label would have landed — this does not merely reduce the
        odds of a collision, it removes the always-on case that guaranteed
        one eventually.
      */}
      {zone === 'all'
        ? (() => {
            const activeZone =
              hoveredPlacement?.group.zone ?? selectedPlacement?.group.zone ?? null;
            if (activeZone === null) return null;
            const a = ZONE_ANCHORS.find((x) => x.zone === activeZone);
            const z = ZONES.find((x) => x.id === activeZone);
            if (!a || !z) return null;
            const t = zoneTonnes[a.zone];
            return (
              <Html
                key={a.zone}
                position={[a.x, a.top + Math.max(3, a.top * 0.07), a.z]}
                center
                zIndexRange={[8, 0]}
                pointerEvents="none"
              >
                <button
                  type="button"
                  onClick={() => onZone(a.zone)}
                  className="pointer-events-auto cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <span className="flex flex-col items-center gap-0.5 whitespace-nowrap rounded-md bg-slate-950/75 px-2 py-1 shadow-lg ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-slate-900/90 hover:ring-cyan-400/50">
                    <span className="text-[11px] font-semibold leading-none text-white">
                      {z.short}
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-[10px] leading-none text-cyan-300">
                      {t === null ? '—' : `${Math.round(t).toLocaleString('en-GB')} t`}
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">{a.bins}</span>
                    </span>
                  </span>
                </button>
              </Html>
            );
          })()
        : (() => {
            const activeGroup = hoveredPlacement?.group.id ?? selectedPlacement?.group.id ?? null;
            if (activeGroup === null) return null;
            const b = BUCKETS.find((x) => x.spec.id === activeGroup && x.spec.zone === zone);
            if (!b) return null;
            const top = Math.max(...b.placements.map((p) => p.topY));
            return (
              <Html
                key={b.spec.id}
                position={[b.spec.cx, top + Math.max(2, top * 0.1), b.spec.cz]}
                center
                zIndexRange={[8, 0]}
                pointerEvents="none"
              >
                <div className="whitespace-nowrap rounded bg-slate-950/70 px-1.5 py-0.5 text-center font-mono text-[10px] leading-tight text-slate-200 shadow ring-1 ring-white/10 backdrop-blur-sm">
                  <span className="font-semibold text-cyan-300">{b.spec.series}</span>
                  <span className="ml-1 text-[9px] text-slate-400">
                    {b.placements.length} × {formatCapacity(b.spec.capacityKg)}
                  </span>
                </div>
              </Html>
            );
          })()}

      {hoveredPlacement && hovered !== selected && (
        <Html
          position={[hoveredPlacement.x, hoveredPlacement.topY + 1.2, hoveredPlacement.z]}
          center
          zIndexRange={[9, 0]}
          pointerEvents="none"
        >
          <HoverChip {...labelFor(hovered!)} />
        </Html>
      )}

      </group>

      <CameraRig
        bounds={framing.bounds}
        dir={framing.dir}
        insetTop={insetTop}
        insetBottom={insetBottom}
      />
      <StatsProbe target={statsRef} />
      <AdaptiveDpr pixelated />
    </>
  );
}

/**
 * The post pass, deliberately its own memoised component.
 *
 * Inline effect children inside `Scene` are recreated on every render of it —
 * which means on every hover, every selection and every data refresh. r3f's
 * postprocessing drops the old EffectPass objects without disposing them, and
 * N8AO has no cleanup at all, so VRAM climbs while someone simply moves the
 * mouse. Same story for the environment cubemap below: new children identity
 * makes drei re-bake all six faces.
 *
 * Memoising on the two booleans that actually matter fixes both.
 */
/**
 * How much of the post chain is running. 0 is everything, 3 is the least.
 *
 * It used to be a boolean, and dropping it took the WHOLE chain with it —
 * including the tone mapping. That made the fallback a strict regression rather
 * than a simplification: the machine says it is struggling, and the answer it
 * gets is the same picture with every highlight clipped flat to white. The
 * degrade has to shed the expensive passes and keep the cheap, load-bearing one.
 *
 * Cost per tier, counted from the pass structure rather than guessed:
 *   Bloom's mipmap pyramid  16 draws  (8 levels down, 7 up, plus the extract)
 *   N8AO at half resolution  6 draws  (downsample, AO, 2 denoise, composite, copy)
 *   SMAA                     3 draws
 *   ToneMapping + Vignette   1 draw   — they merge into one pass and never go.
 */
type PostTier = 0 | 1 | 2 | 3;

const PostFx = memo(function PostFx({ tier }: { tier: PostTier }) {
  /*
   * Built as a filtered array rather than as `{cond && <Effect/>}` children.
   *
   * EffectComposer types its children as elements and walks them to merge
   * compatible effects into a single pass, so a literal `false` in that list is
   * both a type error and something it would have to reason about.
   */
  const passes = [
    /* Ambient occlusion is what this scene was missing most after the
       environment map: 136 vessels standing on a flat plane had no contact with
       it and no shading in the gaps between them. Second to go. */
    tier < 2 ? (
      <N8AO key="ao" aoRadius={6} intensity={2.2} distanceFalloff={1.2} halfRes color="#1d222b" />
    ) : null,
    /* First to go, because it is by far the most expensive thing here — the
       mipmap pyramid alone is sixteen passes. `levels` defaults to 8; five is
       still smooth and saves six draw calls on every frame, at every tier. */
    tier < 1 ? (
      <Bloom
        key="bloom"
        intensity={0.55}
        luminanceThreshold={0.82}
        luminanceSmoothing={0.25}
        mipmapBlur
        levels={5}
      />
    ) : null,
    /*
     * Tone mapping MUST be in the chain rather than on the renderer, and must
     * never be dropped at any tier.
     *
     * EffectComposer sets `gl.toneMapping = NoToneMapping` when it takes over,
     * because tone mapping has to happen after the effects and not before them.
     * Without this effect the scene renders with no tone mapping at all and
     * every value above 1.0 clips flat to white — which is exactly what
     * happened once already: the sky, the ground and the silos all went pale
     * together and no amount of tuning the sun, the fog or the sky scattering
     * moved them, because the clipping was downstream of all of it.
     *
     * It and the vignette merge into one pass, so keeping them costs a single
     * draw call, which is why the degrade sheds Bloom and AO before either.
     *
     * One thing this is NOT: an audit claimed the old all-or-nothing fallback
     * clipped everything white because it took the tone mapping with it. It
     * does not — @react-three/postprocessing saves gl.toneMapping on mount and
     * RESTORES it on unmount (EffectComposer.js:117-122), so with no composer
     * the renderer applies its own ACES from `onCreated`. The reason to tier is
     * smaller and duller: dropping AO, bloom and antialiasing in one step is a
     * bigger jump than the machine usually needs, and bloom alone is sixteen of
     * the chain's twenty-six passes.
     */
    <ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />,
    <Vignette key="vignette" offset={0.32} darkness={0.42} />,
    tier < 3 ? <SMAA key="smaa" /> : null,
  ].filter(Boolean) as JSX.Element[];

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {passes}
    </EffectComposer>
  );
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * Can this browser run the view at all?
 *
 * WebGL2 specifically, not "any WebGL". three 0.169 requests a `webgl2` context
 * and throws if it cannot get one, so a WebGL1-only browser would sail past a
 * looser check, skip the Storage fallback offered below, and then fail inside
 * Canvas setup — a blank panel instead of a useful message.
 *
 * The probe context is released immediately. Browsers cap the number of live
 * contexts, and leaving throwaway ones around makes the browser more likely to
 * evict the real one.
 */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Is this machine rendering in software rather than on a GPU?
 *
 * On a software rasteriser (a bare VM, a locked-down desktop, some remote
 * sessions) shadow maps and antialiasing are ruinously expensive and can cost
 * the WebGL context outright. When one is detected we drop to a cheap path
 * rather than letting the page die.
 */
function isSoftwareRenderer(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return true;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if (!dbg) return false;
    return /SwiftShader|Basic Render|llvmpipe|Software|Microsoft Basic/i.test(name);
  } catch {
    return false;
  }
}

export default function Plant3D() {
  /*
   * Daylight by default — client's final decision 2026-09-02 after trying
   * dusk; the argument about orange casts in the earlier comment is
   * preserved in the design log 8k/8l.
   */
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  /*
   * See-through by default. 113 of the 131 bins are indoors, so with solid
   * shells the opening view of a silo monitor shows eighteen silos and four
   * roofs. The buildings are context; the bins are the point.
   */
  const [ghosted, setGhosted] = useState(true);
  /*
   * Silo numbers, off by default.
   *
   * They answer a real question — "which bin is 312?" — but only sometimes,
   * and the rest of the time they are 70 pieces of text over the plant. Off is
   * the honest default for something you turn to when you need it; the search
   * box remains the way to find one specific bin without covering the rest.
   */
  const [showNumbers, setShowNumbers] = useState(false);
  const [numberLayout, setNumberLayout] = useState<SiloNumberLabel[]>([]);
  /*
   * Opens on the outside yard, not on the whole site.
   *
   * The whole-site view cannot show a readable bin and no amount of tuning will
   * make it. The plant is 280 m of spine on a canvas near 3:1, and `SITE_VIEW`'s
   * own comment concedes that the broadside framing already spends essentially
   * the whole frame width on that length — so a 2.4 m finished-feed bin is
   * 0.86% of it. That is arithmetic, not a camera setting.
   *
   * The thing that settles it: the 100 and 200 series are drawn at TRUE size —
   * `sizeScale()` is keyed to capacity now, and 1,600 t is the largest capacity
   * on the plant, so those two groups are the one fixed point the curve never
   * moves. (The 500 series is smaller — 160 t — so it is drawn a little bigger
   * than life like everything else that is not the 100/200 series; still tiny
   * against a 280 m site.) They are exactly as lost in the whole-site frame as
   * the compressed indoor bins are. So the bins are not drawn wrong. The
   * distance is wrong.
   *
   * ...and none of that survived contact with someone opening the page.
   *
   * The reasoning above is still true and the arithmetic still holds. It was
   * also answering the wrong question. It asked "which frame shows a bin best"
   * and defaulted to the yard on that basis — 18 bins of 131. The first
   * reaction from the plant's own side, unprompted, on first sight, was
   * "where are the rest of the silos?", and that is the correct reaction: the
   * opening frame of a view of a plant has to establish that it is a view of
   * the WHOLE plant. Hiding 86% of it to make the remaining 14% legible trades
   * away the one thing the first screen has to do.
   *
   * So the whole site opens, with its real and admitted limitation — you
   * cannot read a level off it — and every zone is one press away. Orientation
   * first, then detail. A picture you cannot read levels off is a worse default
   * than one that makes you wonder whether the data is missing.
   */
  const [zone, setZone] = useState<ZoneId | 'all'>('all');
  const [selected, setSelected] = useState<number | null>(null);
  /* A bin the user asked for by number. Framed on its own until they move on. */
  const [focused, setFocused] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [quality, setQuality] = useState<Quality>('auto');
  const [diagnostics, setDiagnostics] = useState(false);
  /** a material picked out of the plant from the legend */
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  /*
   * Ambient occlusion, bloom and antialiasing are the passes most likely to sink
   * a weak integrated GPU, and "is this machine fast enough" is not something
   * that can be answered by reading the renderer string — the software-renderer
   * check catches a VM, not a slow laptop. So the page measures itself: if the
   * frame rate cannot be held, the whole post pass is dropped and the scene
   * keeps rendering. Sticky, because flipping the effects on and off as the
   * frame rate wobbles is worse than either state.
   */
  /* How much of the post chain has been shed. See PostFx for what each tier
     drops and why tone mapping never is. */
  const [postTier, setPostTier] = useState<PostTier>(0);
  const degraded = postTier > 0;
  /** The canvas currently on screen; older ones are torn down asynchronously. */
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const statsRef = useRef<HTMLSpanElement>(null);
  const hoverRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /* The legend dock always renders — on tablet it stays, horizontally
     scrollable, never removed — so it is always part of what the camera
     leaves room for at the bottom. */
  const dockRef = useRef<HTMLDivElement>(null);
  /* The narrow-viewport bottom sheet, a second thing stacked above the dock
     in that one layout. */
  const sheetRef = useRef<HTMLDivElement>(null);
  /* Full screen's own floating top bar — see the note by its JSX below. */
  const fullscreenBarRef = useRef<HTMLDivElement>(null);
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const [stageWidth, setStageWidth] = useState<number | null>(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 40 });
  /* Below this container width the list pane becomes a bottom sheet instead
     of a second grid column (DESIGN.md: "under 1100px the list becomes a
     bottom sheet"). */
  const narrow = (stageWidth ?? 9999) < 1100;
  /*
   * A SEPARATE, wider threshold for the header's own contents.
   *
   * Measured on the real laptop at 1280px: the zone segmented control's long
   * labels ("Outside Yard", "Minerals & Micro", "Finished Feed" plus their
   * count badges) plus a full look bar (three looks, three view toggles,
   * full screen) plus the theme/bell/settings/avatar cluster do not fit in
   * one 44px-tall row at 1280px, only at something closer to desktop width.
   * `narrow` (1100px) answers "is there room for a list column beside the
   * canvas" — a much smaller question than "does the header's own content
   * fit" — so reusing it here is what produced the wrap. This is checked
   * against the SAME stage-width measurement, just against a number sized to
   * the header's own content instead of the list's.
   */
  const headerCompact = (stageWidth ?? 9999) < 1400;
  const [sheetOpen, setSheetOpen] = useState(false);
  /* Full screen hides the list pane by default so the canvas alone fills
     innerWidth x innerHeight — the acceptance number for full screen — and
     brings the list back only as an overlay drawer the operator asks for. */
  const [listDrawerOpen, setListDrawerOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  const [webgl] = useState(hasWebGL);
  const [software] = useState(isSoftwareRenderer);
  /* 'auto' follows the hardware; the explicit settings let someone on a weak
     machine still see the full-quality look, or force the cheap path on a good one. */
  /*
   * DEV-only `?fx=on` / `?fx=off`, so this view can be SEEN without a person.
   *
   * `scripts/shoot-plant3d.mjs` renders the page in headless Chrome on this
   * machine and screenshots it, which is the only way to look at the thing when
   * the only real browser is a minimised window across a network link. Headless
   * rasterises through SwiftShader, `isSoftwareRenderer()` correctly spots that,
   * and the post chain gets dropped — including the ACES tone mapping that lives
   * inside it. Every screenshot would then come back with the highlights clipped
   * flat to white and would be blamed on the lighting.
   *
   * Driving it through the quality buttons instead would tie the harness to the
   * HUD's markup, which is exactly the thing most likely to be rewritten.
   */
  const fxOverride = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('fx')
    : null;
  const forceFx = fxOverride === 'on';
  const lowPower =
    fxOverride === 'on'
      ? false
      : fxOverride === 'off'
        ? true
        : quality === 'low' || (quality === 'auto' && software);

  const readings = useSiloReadings(webgl);

  /* A mask typo would change a silo count silently and every number downstream
     would still look plausible. Fail loudly instead. */
  const modelProblems = useMemo(() => assertSiloModel(), []);

  /*
   * Fill the space that is actually left, rather than guessing at it.
   *
   * The page chrome is not a fixed height - the header is 120px in sidebar mode
   * and 76-132px in topbar mode - and `main` is a scroll container that will
   * happily let a too-tall child push the canvas off the bottom of the screen.
   * That is exactly what a `72vh` guess did on a 1280x720 laptop: 113px of the
   * view hung below the fold. Measuring the gap between this element and the
   * bottom of its scroll container gets it right on any screen and any nav
   * layout, and by construction leaves nothing to scroll.
   */
  useLayoutEffect(() => {
    if (expanded) return undefined;
    const el = stageRef.current;
    const main = el?.closest('main');
    if (!el || !main) return undefined;

    const measure = () => {
      const mainBox = main.getBoundingClientRect();
      /* Both rects are viewport-relative, so their difference plus the current
         scroll offset is the element's position within the scrolled content -
         stable whether or not the container happens to be scrolled. */
      const offsetWithin = el.getBoundingClientRect().top - mainBox.top + main.scrollTop;
      const padBottom = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      setStageHeight(Math.max(260, Math.round(main.clientHeight - offsetWithin - padBottom)));
      setStageWidth(Math.round(el.clientWidth));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [expanded]);

  /*
   * react-three-fiber sizes itself from a ResizeObserver on its container and
   * only builds the renderer once it has a non-zero measurement. In this app the
   * observer never delivered that first measurement, so onCreated never ran and
   * the canvas stayed blank forever — with no console error, a valid WebGL
   * context and a correctly laid out DOM. Nudging the window forces it. Cheap,
   * and a no-op if the observer did fire. Also re-run on the full-screen toggle,
   * which changes the container size outside React's knowledge of the canvas.
   */
  useEffect(() => {
    const nudge = () => window.dispatchEvent(new Event('resize'));
    const raf = requestAnimationFrame(nudge);
    const t = window.setTimeout(nudge, 350);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
    /* `lowPower` is in here because changing it remounts the Canvas via its key.
       A fresh canvas is a fresh chance to hit the missing-first-measurement bug,
       and the nudge is what covers it. */
  }, [expanded, stageHeight, lowPower]);

  /* A quality change rebuilds the canvas, so a stale "context lost" banner from
     the old one must not survive onto the new, working one. */
  useEffect(() => {
    setContextLost(false);
  }, [lowPower]);

  /* The drawer is a full-screen-only affordance; leaving full screen with it
     open must not leave it silently open (and reserving camera space) the
     next time full screen is entered. */
  useEffect(() => {
    if (!expanded) setListDrawerOpen(false);
  }, [expanded]);

  /*
   * insetTop is 0 outside full screen — nothing floats above the plant there,
   * the zone switch and the look bar both live in the page header, outside
   * the stage entirely — and the floating top bar's measured height in full
   * screen, where the page header is covered by the fixed-position stage and
   * that bar is what takes its place. insetBottom is always the dock's own
   * measured height (plus the sheet's, when it is showing) plus an 8px
   * gutter, so the camera fit and the silo-number projector both leave
   * exactly the room the floating chrome actually occupies, not a guess.
   */
  useEffect(() => {
    const measure = () => {
      /* The dock always renders (it must stay on tablet too — never
         removed), and on top of it, in the narrow layout only, the bottom
         sheet stacks above the dock rather than replacing it. Both are
         measured live so the camera's reserved band tracks whichever is
         actually on screen, including the sheet's own open/peek animation —
         a ResizeObserver fires on every frame of that, not just its ends. */
      const dock = dockRef.current?.offsetHeight ?? 32;
      const sheet = narrow && !expanded ? (sheetRef.current?.offsetHeight ?? 0) : 0;
      /* In full screen the floating top bar (zone switch + look bar,
         rendered inside the stage because the real page header is covered
         by the fixed-position stage) takes the top instead of nothing. */
      const top = expanded ? (fullscreenBarRef.current?.offsetHeight ?? 0) + 8 : 0;
      const bottom = dock + sheet + 8;
      setInsets((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (dockRef.current) ro.observe(dockRef.current);
    if (sheetRef.current) ro.observe(sheetRef.current);
    if (fullscreenBarRef.current) ro.observe(fullscreenBarRef.current);
    return () => ro.disconnect();
  }, [narrow, expanded]);

  /*
   * Any keyboard shortcut here (Escape today, more later — DESIGN.md's
   * camera workstream adds `/`, `1-6`, arrows, `F`, `N`) has to check this
   * first. Without it, typing "312" into the silo finder to jump to bin 312
   * would also step zones on every digit the shortcut layer recognises, and
   * pressing Escape to clear a half-typed search would instead deselect the
   * bin the operator is trying to look UP.
   */
  const isTypingTarget = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      /* Escape inside the list's search field clears/blurs the field itself
         (the browser's native behaviour on some inputs, and SiloList's own
         concern otherwise) rather than walking the selection stack. */
      if (isTypingTarget(e.target)) return;
      if (focused !== null) setFocused(null);
      else if (selected !== null) setSelected(null);
      else if (highlighted !== null) setHighlighted(null);
      else if (expanded) setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, expanded, focused, highlighted]);

  /*
   * Framing a zone hides the other groups, so a selection made elsewhere would
   * leave a detail panel and a floor ring describing a bin that is no longer on
   * screen. Changing zone therefore drops any selection that does not belong to
   * it — and drops the finder's framing, which was aimed at that bin.
   */
  const goToZone = useCallback((z: ZoneId | 'all') => {
    setFocused(null);
    setZone(z);
    setSelected((current) => {
      if (current === null || z === 'all') return current;
      return SILO_BY_NO.get(current)?.group.zone === z ? current : null;
    });
  }, []);

  const findSilo = useCallback((no: number) => {
    const p = SILO_BY_NO.get(no);
    if (!p) return false;
    setZone(p.group.zone);
    setSelected(no);
    setFocused(no);
    return true;
  }, []);

  /*
   * Step through the bins behind an alarm count.
   *
   * Repeated presses advance, so two locked bins are two presses rather than a
   * number you have to go and find yourself. Only bins the model knows about:
   * one it cannot draw is one it cannot take you to.
   */
  const goToAlarm = useCallback(
    (which: 'high' | 'locked') => {
      const hits = readings.rows
        .filter((r) => (which === 'high' ? r.hlActive : r.lockActive) && SILO_BY_NO.has(r.siloNo))
        .map((r) => r.siloNo)
        .sort((a, b) => a - b);
      if (!hits.length) return;
      const at = selected === null ? -1 : hits.indexOf(selected);
      findSilo(hits[(at + 1) % hits.length]);
    },
    [readings.rows, selected, findSilo],
  );

  const onHover = useCallback((no: number | null) => {
    /* Pointer-move fires many times a second; only re-render when the bin under
       the cursor actually changes. */
    if (hoverRef.current === no) return;
    hoverRef.current = no;
    setHovered(no);
  }, []);

  const look = LOOKS[timeOfDay];

  /* One SiloVisual per bin, in bucket order, matching the instance order. */
  const visuals = useMemo(
    () =>
      BUCKETS.map((bucket) =>
        bucket.placements.map<SiloVisual>((p) => {
          const r = readings.byNo.get(p.siloNo);
          const level = siloLevel(p, r);
          return {
            color: new THREE.Color(materialColorIn(readings.palette, r?.materialCode)),
            fill: level.fill ?? 0,
            /*
             * Two reasons to mute a bin: it is not monitored at all (the 500
             * tanks), or the legend is picking out a different material. The
             * stronger of the two wins.
             */
            dim: Math.max(
              bucket.spec.monitored ? 0 : 0.5,
              /* `String(...)` and not `?? ''`: the field is TYPED string | null
                 and the API does not keep that promise — it sends numbers. `??`
                 replaces null and undefined and passes 105 straight through to
                 a `.trim()` that does not exist on it. This is the same defect
                 that once blanked the whole page, and the correctly-guarded
                 version of it is four lines below in this same function. */
              highlighted !== null && String(r?.materialCode ?? '').trim() !== highlighted
                ? 0.85
                : 0,
            ),
            highlight: p.siloNo === selected ? 1 : p.siloNo === hovered ? 0.5 : 0,
            /* Ten bins in the whole plant carry a material code. Telling the
               shader which ten is what lets those ten be coloured properly
               instead of every bin being tinted faintly just in case. 999 is
               the plant's own out-of-service code, which is not a material. */
            known: (() => {
              const code = String(r?.materialCode ?? '').trim();
              return code !== '' && code !== OUT_OF_SERVICE ? 1 : 0;
            })(),
          };
        }),
      ),
    [readings.byNo, readings.palette, selected, hovered, highlighted],
  );

  const framing = useMemo(() => {
    const z = ZONES.find((x) => x.id === zone);
    /*
     * Fit to every silo's OWN box, not the flat-padded ZONE_BOUNDS/SITE_BOUNDS
     * rectangle. See the comment on `fitToBounds` for why: that rectangle's
     * pad was sized to clear a whole cluster and, measured on the compact
     * zones (raw material, press buffer), dwarfed the bins actually drawn
     * inside it. ZONE_BOUNDS/SITE_BOUNDS themselves are untouched — labels,
     * anchors and everything else that reads them still gets the same box.
     */
    /*
     * A gallery that `Galleries` draws for this zone has to be inside the box
     * the camera fits to as well, or it hangs in the frame outside the
     * fitted view — a raised truss with nothing else the eye can pin it to.
     * Same visibility rule as `Galleries` uses, so what's drawn and what's
     * fitted never disagree about which galleries belong to this zone.
     *
     * Only the part of it near THIS zone's own footprint constrains the fit
     * (galleryFitBox's zoneFp argument) — measured why: fitting a connector's
     * FULL run for Finished Feed pulled the frame back enough to take
     * verify:picture's silo coverage from 18.16% to 6.2%, because the far end
     * reaches toward the buffer zone it also serves and has no bins near it
     * on this side. A gallery still renders past that clip; it just stops
     * being a reason to back the camera up.
     */
    const zoneFp = z ? ZONE_FOOTPRINT[z.id] : null;
    const galleryBoxes = (z ? GALLERIES.filter((g) => galleryTouchesZone(g, z.id)) : GALLERIES).map(
      (g) => galleryFitBox(g, zoneFp),
    );
    /* Same requirement as the galleries, and Platform already carries its
       own `zone` — no nearest-cluster guess needed. An elevated zone's own
       deck is drawn (see the PLATFORMS filter above) and has to be inside
       the fitted box, or the slab reads as bigger than the bins standing on
       it with nothing tying the two together. */
    const platformBoxes = (z ? PLATFORMS.filter((p) => p.zone === z.id) : PLATFORMS).map((p) =>
      platformFitBox(p),
    );
    const zoneFraming = z
      ? {
          bounds: [
            /* Framed on everything the view will SHOW, not only on what the
               zone owns — otherwise a bin standing in this zone's building is
               drawn but never accounted for, and can sit outside the frame. */
            ...siloFitBoxes(SILOS.filter((s) => groupInZone(s.group, z.id))),
            ...galleryBoxes,
            ...platformBoxes,
          ],
          dir: z.dir,
        }
      : { bounds: [...siloFitBoxes(SILOS), ...galleryBoxes, ...platformBoxes], dir: SITE_VIEW.dir };

    const p = focused !== null ? SILO_BY_NO.get(focused) : undefined;
    if (!p) return zoneFraming;
    /* Enough room around the bin to see its neighbours, so it reads as "that one,
       there" rather than as a cylinder filling the screen with no context. */
    const pad = Math.max(4, p.dims.diameter * p.drawScale * 2.2);
    return {
      bounds: [
        {
          min: [p.x - pad, p.floor * VERTICAL_EXAGGERATION, p.z - pad] as [number, number, number],
          max: [p.x + pad, (p.topY + 2) * VERTICAL_EXAGGERATION, p.z + pad] as [
            number,
            number,
            number,
          ],
        },
      ],
      dir: zoneFraming.dir,
    };
  }, [zone, focused]);

  const summary = useMemo(() => {
    let withStock = 0;
    let noLevel = 0;
    let kg = 0;
    for (const p of SILOS) {
      if (!p.group.monitored) continue;
      const level = siloLevel(p, readings.byNo.get(p.siloNo));
      if (level.reason) {
        noLevel += 1;
        continue;
      }
      const q = level.quantityKg ?? 0;
      if (q > 0) {
        withStock += 1;
        /* Only positive quantities are totalled. A drifting scale reporting
           -477 kg must not quietly subtract itself from the plant's stock. */
        kg += q;
      }
    }
    return {
      bins: SILOS.filter((p) => p.group.monitored).length,
      tonnes: kg / 1000,
      withStock,
      noLevel,
      /* Alarm counts come from bins the model knows about. A row for a silo
         that is not in the model cannot be found, framed or inspected, so
         counting it would put an alarm on screen with nothing to point at. */
      highLevel: readings.rows.filter((r) => r.hlActive && SILO_BY_NO.has(r.siloNo)).length,
      locked: readings.rows.filter((r) => r.lockActive && SILO_BY_NO.has(r.siloNo)).length,
    };
  }, [readings.byNo, readings.rows]);

  const materials = useMemo(
    () => materialsPresent(readings.rows.filter((r) => SILO_BY_NO.has(r.siloNo)), readings.palette),
    [readings.rows, readings.palette],
  );

  /* Rows the model has no silo for. Not drawn, not counted — but worth saying,
     because it means the plant has a bin this view does not know about. */
  const unknownRows = useMemo(
    () => readings.rows.filter((r) => !SILO_BY_NO.has(r.siloNo)).length,
    [readings.rows],
  );

  /* A filter for a material the plant no longer holds would grey out everything
     and describe nothing. */
  useEffect(() => {
    if (highlighted === null) return;
    if (!materials.some((m) => m.code === highlighted)) setHighlighted(null);
  }, [materials, highlighted]);

  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of SILOS) {
      if (!p.group.monitored) continue;
      counts[p.group.zone] = (counts[p.group.zone] ?? 0) + 1;
    }
    return counts;
  }, []);

  const labelFor = useCallback(
    (no: number): HoverInfo => {
      const p = SILO_BY_NO.get(no);
      const r = readings.byNo.get(no);
      const level = p ? siloLevel(p, r) : null;
      return {
        siloNo: no,
        material: materialLabel(r),
        color: materialColorIn(readings.palette, r?.materialCode),
        fill: level?.fill ?? null,
        pct: !level || level.fill === null ? '***' : formatPercent(level.fraction),
        hl: !!r?.hlActive,
        lock: !!r?.lockActive,
      };
    },
    [readings.byNo, readings.palette],
  );

  /* Tonnes held per zone, for the zoomed-out markers. Null when a zone has
     nothing measurable, so it shows a dash rather than a confident zero. */
  const zoneTonnes = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const a of ZONE_ANCHORS) {
      let kg = 0;
      let any = false;
      for (const no of a.siloNos) {
        const p = SILO_BY_NO.get(no);
        if (!p) continue;
        const level = siloLevel(p, readings.byNo.get(no));
        if (level.reason) continue;
        any = true;
        kg += Math.max(0, level.quantityKg ?? 0);
      }
      out[a.zone] = any ? kg / 1000 : null;
    }
    return out;
  }, [readings.byNo]);

  const selectedPlacement = selected !== null ? SILO_BY_NO.get(selected) : undefined;
  const zoneLabel = zone === 'all' ? 'Whole site' : (ZONES.find((z) => z.id === zone)?.label ?? 'Whole site');

  /* The exact set of bins the list shows for the current zone — `groupInZone`
     is the same test `Scene` uses to decide what to draw, so the list and the
     model can never disagree about what "this zone" means. Includes the
     unmonitored 500-series tanks when they belong to the view; SiloList
     renders those as "Not monitored" rows rather than dropping them. */
  const visibleSilos = useMemo(() => SILOS.filter((p) => groupInZone(p.group, zone)), [zone]);

  const headerCenter = (
    <ZoneSwitch zones={ZONES} zone={zone} counts={zoneCounts} onSelect={goToZone} compact={headerCompact} />
  );

  const headerRight = (
    <LookBar
      timeOfDay={timeOfDay}
      onTimeOfDay={setTimeOfDay}
      ghosted={ghosted}
      onGhosted={setGhosted}
      expanded={expanded}
      onExpanded={setExpanded}
      diagnostics={diagnostics}
      onDiagnostics={setDiagnostics}
      numbers={showNumbers}
      onNumbers={setShowNumbers}
      compact={headerCompact}
    />
  );

  if (!webgl) {
    return (
      <WaterSystemLayout title="Plant 3D" subtitle="3D view of the plant silos">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-200">
          This browser has no WebGL support, so the 3D view cannot run here. The same silo
          information is available on the{' '}
          <Link href="/fakieh/storage" className="underline">
            Storage
          </Link>{' '}
          screen.
        </div>
      </WaterSystemLayout>
    );
  }

  const stage = (
    <div
      ref={stageRef}
      style={expanded || stageHeight === null ? undefined : { height: stageHeight }}
      className={
        expanded
          ? 'fixed inset-0 z-50 overflow-hidden bg-slate-950'
          : 'relative h-full min-h-[260px] w-full overflow-hidden bg-slate-950'
      }
    >
      {/*
        Split view: canvas `minmax(0, 1fr)` + list `clamp(280px, 28%, 360px)`
        on a wide viewport; a single column with the list riding as a bottom
        sheet under 1100px container width (DESIGN.md). `grid-template-rows`
        stays a single row either way — the sheet is an overlay, not a grid
        cell, so dragging or opening it never triggers a resize of the r3f
        canvas underneath it.

        Full screen ALSO collapses to a single column — the list pane is a
        grid column there too, and a grid column still claims its track's
        width even when nothing sensible would render in it, so a fixed
        `clamp(280px, 28%, 360px)` column would leave the canvas short of
        `innerWidth` by exactly that much. Full screen's canvas-must-equal-
        the-viewport requirement means the list has to leave the grid
        entirely there, which is what the overlay drawer below is for.
      */}
      <div
        className="relative min-h-0 min-w-0 overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns:
            narrow || expanded ? '1fr' : 'minmax(0, 1fr) clamp(280px, 28%, 360px)',
          height: '100%',
          width: '100%',
        }}
      >
      <div className="relative min-h-0 min-w-0 overflow-hidden">
      <Canvas
        /*
         * Antialiasing is a WebGL context-creation attribute, and r3f builds the
         * renderer exactly once. Without this key, "force antialiasing on" was a
         * button that changed the shadow map and the pixel ratio and quietly did
         * nothing about the thing it named. Keying on it remounts the canvas,
         * which is heavy — and correct, and rare.
         */
        key={lowPower ? 'cheap' : 'full'}
        shadows
        dpr={lowPower ? 1 : [1, 2]}
        camera={{ position: [-40, 150, 240], fov: 42, near: 0.5, far: 2400 }}
        gl={{ antialias: !lowPower, powerPreference: 'high-performance' }}
        /*
         * Measure by offsetWidth/offsetHeight rather than getBoundingClientRect,
         * so no ancestor transform can scale the measurement. NOTE: this alone
         * did not fix the blank canvas — see the resize nudge above.
         */
        resize={{ offsetSize: true }}
        onPointerMissed={() => {
          /* Every other way of dropping a selection also releases the finder's
             framing. This one did not, which left the camera locked on a bin
             with nothing selected and no way back to the zone view. */
          setSelected(null);
          setFocused(null);
        }}
        onCreated={(state) => {
          const { gl } = state;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.92;

          /* Dev-only handle so the scene can be measured from the console rather
             than reasoned about. Stripped from production builds. */
          if (import.meta.env.DEV) {
            (window as unknown as { __plant3d?: unknown }).__plant3d = state;
          }

          /*
           * A lost context freezes the render loop with the last frame still on
           * screen, which looks like a working page that has silently stopped
           * updating — the worst failure mode for an operations screen. Catch it
           * and say so. preventDefault() lets the browser restore the context.
           */
          const canvas = gl.domElement;
          liveCanvasRef.current = canvas;
          /* Whatever the outgoing canvas said on its way out does not apply to
             this one. Clearing here as well as in the effect closes the window
             where the old canvas loses its context before this one exists. */
          setContextLost(false);

          /*
           * Ignore events from a canvas that is no longer the live one.
           *
           * Changing quality remounts the Canvas, and r3f tears the old one down
           * on a 500 ms delay by calling `forceContextLoss()` — which fires
           * `webglcontextlost` on the OLD canvas, after the new one is already
           * rendering. Without this identity check that lands as "the 3D view
           * lost its graphics context" on a view that is working perfectly.
           * `onCreated` has no cleanup hook to remove the listener in, so the
           * guard is the fix.
           */
          const onLost = (e: Event) => {
            if (liveCanvasRef.current !== canvas) return;
            e.preventDefault();
            setContextLost(true);
          };
          const onRestored = () => {
            if (liveCanvasRef.current !== canvas) return;
            setContextLost(false);
          };
          canvas.addEventListener('webglcontextlost', onLost);
          canvas.addEventListener('webglcontextrestored', onRestored);
        }}
      >
        {/* Skipped entirely under ?fx=on: the headless screenshot harness
            rasterises on the CPU at a few frames a second, which this would
            correctly read as a machine that cannot hold the effects — and
            then every shot after the first would silently lose its tone
            mapping and come back washed out. */}
        {!forceFx && (
          <PerformanceMonitor
            onFallback={() => setPostTier((v) => (v < 3 ? ((v + 1) as PostTier) : v))}
            onDecline={() => setPostTier((v) => (v < 3 ? ((v + 1) as PostTier) : v))}
            onIncline={() => setPostTier((v) => (v > 0 ? ((v - 1) as PostTier) : v))}
          />
        )}
        <Suspense fallback={null}>
          <Scene
            look={look}
            ghosted={ghosted}
            zone={zone}
            lowPower={lowPower}
            statsRef={statsRef}
            visuals={visuals}
            selected={selected}
            hovered={hovered}
            onHover={onHover}
            onSelect={(no) => {
              /* Picking a different bin by hand releases the finder's framing,
                 which was aimed at the one that was searched for. */
              setFocused((f) => (f === no ? f : null));
              setSelected(no);
            }}
            onZone={goToZone}
            labelFor={labelFor}
            zoneTonnes={zoneTonnes}
            framing={framing}
            insetTop={insets.top}
            insetBottom={insets.bottom}
            showNumbers={showNumbers}
            onNumberLayout={setNumberLayout}
          />
        </Suspense>

        {/* Outside <Scene> on purpose — see PostFx. */}
        {!lowPower && <PostFx tier={forceFx ? 0 : postTier} />}

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI / 2.06}
          minDistance={6}
          maxDistance={560}
          makeDefault
        />
      </Canvas>

      {/*
        Silo numbers, drawn over the canvas but under the legend dock (z-10
        against the dock's z-20). One overlay rather than 131 <Html> nodes —
        see SiloNumberProjector for why, and for the culling that decides
        which of these exist at all.
      */}
      {showNumbers && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {numberLayout.map((l) => (
            <span
              key={l.siloNo}
              /* One ring value for both themes. The light-mode pseudo-variant
                 is hand-written in index.css and defines no ring rules at all,
                 so a light-mode ring class compiles to nothing; `ring-cyan-400/30`
                 is a hairline that reads against the dark card fill and the
                 pale one alike. The class check caught the first attempt — and
                 then caught this comment naming the class, which is worth
                 knowing: that scanner reads comments too. */
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-950/85 px-1 py-px font-mono text-[10px] font-semibold leading-none text-cyan-200 ring-1 ring-cyan-400/30 light:bg-white/90 light:text-cyan-700"
              style={{ left: `${l.x}px`, top: `${l.y}px` }}
            >
              {l.siloNo}
            </span>
          ))}
        </div>
      )}

      {/*
        Diagnostics — off by default, and the one HUD element still allowed to
        float freely over the picture besides the dock, the pills and the
        hover chip: it is a debug instrument, not part of the operating view,
        and only ever on screen when someone has explicitly asked for it.
      */}
      {diagnostics && (
        <div className="pointer-events-none absolute left-2 top-2 z-20">
          <div className="pointer-events-auto">
            <DiagnosticsBar
              statsRef={statsRef}
              quality={quality}
              onQuality={setQuality}
              software={software}
              degraded={degraded}
            />
          </div>
        </div>
      )}

      {/*
        The single 32px dock along the bottom edge of the canvas pane — the
        only other thing that floats over the plant besides the pills and the
        hover chip (DESIGN.md). Always rendered, on every layout including
        tablet — a Codex audit caught the first version of this hiding it
        under 1100px, which is exactly the layout the dock's own horizontal
        scroll exists for. On the narrow layout the bottom sheet stacks
        ABOVE it (see the sheet below), not in place of it.
      */}
      <LegendDock
        ref={dockRef}
        materials={materials}
        highlighted={highlighted}
        onHighlight={setHighlighted}
      />

      {/*
        Full screen's own floating top bar.
        The real page header (WaterSystemLayout, immersive strip) is a normal
        in-flow element; the stage in full screen is `fixed inset-0 z-50`,
        which paints over it regardless of DOM order. So the zone switch and
        the look bar — both moved OUT of the stage and into that header for
        the split-view layout — would simply disappear the moment full
        screen engaged, taking the full-screen EXIT control down with them.
        This reuses the exact same components (so aria-label/title stay
        identical for the harness) as a floating overlay INSIDE the stage,
        the same place they lived before this phase, but only in this one
        state where the alternative is losing them.
      */}
      {expanded && (
        <div
          ref={fullscreenBarRef}
          className="pointer-events-none absolute inset-x-3 top-3 z-40 flex items-center justify-between gap-3"
        >
          <div className="pointer-events-auto min-w-0 rounded-full bg-slate-950/90 p-1 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
            <ZoneSwitch zones={ZONES} zone={zone} counts={zoneCounts} onSelect={goToZone} compact={headerCompact} />
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            <div className="rounded-full bg-slate-950/90 p-1 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
              <LookBar
                timeOfDay={timeOfDay}
                onTimeOfDay={setTimeOfDay}
                ghosted={ghosted}
                onGhosted={setGhosted}
                expanded={expanded}
                onExpanded={setExpanded}
                diagnostics={diagnostics}
                onDiagnostics={setDiagnostics}
                numbers={showNumbers}
                onNumbers={setShowNumbers}
                compact={headerCompact}
              />
            </div>
            {/*
              The list toggle: full screen hides the list pane by default so
              the canvas alone fills innerWidth x innerHeight (the acceptance
              number), and this is the one way back to it — a 44px control
              that slides the list in as an overlay drawer over the right
              edge rather than reclaiming a grid column, which would shrink
              the canvas back below the viewport.
            */}
            <button
              type="button"
              onClick={() => setListDrawerOpen((o) => !o)}
              title={listDrawerOpen ? 'Hide the silo list' : 'Show the silo list'}
              aria-label="Toggle silo list"
              aria-pressed={listDrawerOpen}
              className="touch-target-44 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/90 text-slate-200 shadow-lg ring-1 ring-white/10 backdrop-blur-md hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/*
        Full screen's list drawer — an overlay over the right edge of the
        canvas, not a grid column, so the canvas element's own size never
        changes when this opens. Rendered off-screen (translateX 100%) and
        always mounted rather than conditionally, the same reasoning as the
        View-options menu: a control worth reaching by keyboard or the
        harness should exist in the DOM whether or not it is presently
        visible.
      */}
      {expanded && (
        <motion.div
          className="absolute inset-y-0 right-0 z-40 w-[clamp(280px,28%,360px)] max-w-[85vw] overflow-hidden border-l border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-md light:border-gray-200 light:bg-white/95"
          initial={false}
          animate={{ x: listDrawerOpen ? 0 : '100%' }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          aria-hidden={!listDrawerOpen}
        >
          <SiloList
            placements={visibleSilos}
            readings={readings}
            summary={summary}
            selected={selected}
            hovered={hovered}
            onHover={onHover}
            onFind={findSilo}
            onGoToAlarm={goToAlarm}
            onDeselect={() => {
              setSelected(null);
              setFocused(null);
            }}
          />
        </motion.div>
      )}

      {contextLost && (
        <div className="absolute inset-x-0 top-0 z-30 bg-amber-500/90 px-3 py-2 text-center text-xs font-medium text-amber-950">
          The 3D view lost its graphics context and has stopped updating. Reload the page to restore
          it — the values shown are no longer live.
        </div>
      )}

      {modelProblems.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-30 bg-red-600/90 px-3 py-2 text-center text-xs font-medium text-white">
          Silo model does not match the plant: {modelProblems.join('; ')}
        </div>
      )}
      </div>

      {/* ---- list pane (wide viewport: a real grid column) ---------------- */}
      {!narrow && !expanded && (
        <div
          data-plant3d-list-pane
          className="min-h-0 min-w-0 overflow-hidden border-l border-slate-800 bg-slate-950/95 light:border-gray-200 light:bg-white/95"
        >
          <SiloList
            placements={visibleSilos}
            readings={readings}
            summary={summary}
            selected={selected}
            hovered={hovered}
            onHover={onHover}
            onFind={findSilo}
            onGoToAlarm={goToAlarm}
            onDeselect={() => {
              setSelected(null);
              setFocused(null);
            }}
          />
        </div>
      )}
      </div>

      {/*
        ---- bottom sheet (narrow, non-full-screen: the list rides below the
        canvas) --------------------------------------------------------
        A real DOM sibling of the grid, not a grid cell — its height animates
        between a peek (the handle, the KPI strip, the finder and the first
        couple of rows) and 45% of the stage, and animating a grid track
        height would resize the r3f canvas on every frame of that animation.
        Overlaying it instead means the canvas never resizes for this.

        Never shown in full screen — full screen has its own drawer above,
        because full screen's canvas has to equal innerWidth x innerHeight
        exactly and a sheet is a persistent bottom band, not an overlay that
        gets out of the way entirely.
      */}
      {narrow && !expanded && (
        <motion.div
          ref={sheetRef}
          data-plant3d-sheet
          className="absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden border-t border-slate-800 bg-slate-950/95 shadow-[0_-4px_16px_rgba(0,0,0,0.25)] backdrop-blur-md light:border-gray-200 light:bg-white/95"
          initial={false}
          animate={{ height: sheetOpen ? '45%' : SHEET_PEEK }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
        >
          <motion.button
            type="button"
            onClick={() => setSheetOpen((o) => !o)}
            aria-expanded={sheetOpen}
            aria-label={sheetOpen ? 'Collapse the bin list' : 'Expand the bin list'}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.y < -20) setSheetOpen(true);
              else if (info.offset.y > 20) setSheetOpen(false);
            }}
            className="touch-target-44 flex h-12 shrink-0 items-center justify-center gap-1.5 border-b border-slate-800 light:border-gray-200"
          >
            <span className="h-1 w-10 rounded-full bg-slate-600 light:bg-gray-200" />
          </motion.button>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SiloList
              placements={visibleSilos}
              readings={readings}
              summary={summary}
              selected={selected}
              hovered={hovered}
              onHover={onHover}
              onFind={findSilo}
              onGoToAlarm={goToAlarm}
              onDeselect={() => {
                setSelected(null);
                setFocused(null);
              }}
            />
          </div>
        </motion.div>
      )}
    </div>
  );

  return (
    <WaterSystemLayout
      title="Plant 3D"
      subtitle="Fakieh Feed Factory — live silo view"
      immersive
      headerCenter={headerCenter}
      headerRight={headerRight}
    >
      {stage}
    </WaterSystemLayout>
  );
}
