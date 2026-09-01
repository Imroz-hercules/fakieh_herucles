/**
 * Silo geometry — the surface of revolution every bin is built from.
 *
 * Split out of `siloMesh.tsx` so that file exports nothing but its component.
 * A module that exports both a React component and plain values cannot be hot
 * reloaded: Vite refuses the Fast Refresh boundary and falls back to a full page
 * reload, which in this view means losing the camera, the selection and the
 * whole WebGL context on every keystroke.
 */
import * as THREE from 'three';
import { HOPPER_OUTLET_RATIO, type SiloDims } from './silos';


/**
 * Radial segments, from bin diameter.
 *
 * A 0.45 m micro hopper needs nowhere near the resolution of a 10 m silo, and
 * there are thirty micro hoppers. Clamped so nothing ever looks like a prism.
 */
export function segmentsFor(diameter: number): number {
  return Math.max(10, Math.min(28, Math.round(8 + diameter * 2)));
}

/**
 * How much wider than the barrel the roof eave stands, as a multiple of `r`.
 *
 * A bare cone springing straight out of the wall is the one silhouette
 * feature every bin on this site was missing, hopper-bottomed or flat: real
 * bolted-steel roofs oversail the top ring by a small lip before the cone
 * rises, and that lip is what reads as a roof meeting a wall rather than a
 * cylinder growing a point.
 *
 * Held to 2% — smaller than it would be on a free-standing bin — because it
 * has to clear TWO different tight spots at once, both measured against the
 * true drawn radius via `profileMaxRadius`:
 *
 *   - the 300-series raw-material battery sits 0.57 m clear of the mill wall
 *     at true size, the tightest indoor building clearance on the plant (see
 *     `SIZE_COMPRESSION`'s own note that 0.85 was chosen to clear every
 *     building "with margin to spare" — this eats directly into that
 *     margin). 2% leaves 0.53 m, comfortably over the 0.5 m floor the
 *     building-clearance check enforces; 3% drops it to 0.50 m — genuinely on
 *     the line, not spare room; 4% fails the check outright at 0.48 m.
 *   - the 800-series finished-feed bank packs three rows on a 2.55 m pitch
 *     over a 2.4 m shell, the tightest bin-to-bin spacing on the plant. 2%
 *     leaves it about 13 cm clear — the 300-series building wall binds first.
 *
 * Both proofs are recorded against `verify-plant3d.mjs`'s checks below.
 */
const EAVE_RATIO = 1.02;

/**
 * How much wider than the barrel the flat-bottomed foundation skirt stands.
 *
 * Only `hopperRatio: 0` groups use this — the 100/200/500 series, the three
 * largest-diameter groups on the plant and the only ones with real headroom
 * in their packing (their own pitch clears a 10% skirt with room to spare;
 * see the proof). A hopper-bottomed bin already gets a visible base from its
 * discharge cone and foot; a flat-bottomed one had nothing before this but a
 * shell running straight into the ground.
 */
const SKIRT_RATIO = 1.07;

/**
 * The silo profile, in real metres, revolved about Y.
 *
 * Duplicated points a hair apart give LatheGeometry a hard crease where the
 * hopper meets the barrel and where the barrel meets the roof; without them the
 * shared normals smooth the joint and a cylinder reads as a lumpy cone.
 */
export function siloProfile(d: SiloDims): THREE.Vector2[] {
  const r = d.diameter / 2;
  const eps = Math.max(0.004, d.diameter * 0.003);
  const hasHopper = d.hopper > 0;
  const yStore = d.elevation;
  const yBarrel = yStore + d.hopper;
  const yTop = yBarrel + d.barrel;
  const p: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];

  if (hasHopper) {
    /* The hopper narrows to a real outlet, not to a point, and the bin is
       carried on a discharge column of that width standing on a flared foot.
       HOPPER_OUTLET_RATIO is the same constant the volume maths uses. */
    const outlet = r * HOPPER_OUTLET_RATIO;
    const foot = Math.max(outlet * 1.6, r * 0.3);
    const footH = Math.min(0.35, yStore * 0.25);
    const collar = Math.min(yStore - eps, footH + Math.max(0.2, yStore * 0.3));
    p.push(new THREE.Vector2(foot, 0));
    p.push(new THREE.Vector2(foot, footH));
    p.push(new THREE.Vector2(outlet, collar));
    p.push(new THREE.Vector2(outlet, yStore));
    p.push(new THREE.Vector2(r, yBarrel));
  } else {
    /* Flat-bottomed silos sit on a foundation skirt wider than the shell —
       a real stem-wall ring the bin stands ON, not the shell simply meeting
       the ground. Squat and stepped in sharply so it reads as a base rather
       than a second, slightly fatter cylinder stacked under the first: the
       skirt only occupies the bottom slice of the clearance height, and the
       rest of the way up to the barrel is plain shell at `r`. */
    const skirt = r * SKIRT_RATIO;
    const skirtH = Math.min(0.9, yStore * 0.3);
    p.push(new THREE.Vector2(skirt, 0));
    p.push(new THREE.Vector2(skirt, skirtH));
    p.push(new THREE.Vector2(r, skirtH + eps));
    p.push(new THREE.Vector2(r, yStore));
  }

  p.push(new THREE.Vector2(r, yBarrel + eps));
  p.push(new THREE.Vector2(r, yTop));
  p.push(new THREE.Vector2(r, yTop + eps));
  /* The roof eave: a short lip that flares out and up before the cone rises
     to its apex, so the roof reads as a cap that was PUT ON the wall rather
     than a wall that happens to taper. Tied to the radius jump rather than to
     `d.roof` so the lip stays a lip — mostly horizontal — on every roof
     height this file derives, instead of drifting into a second cone on a
     tall roof or vanishing into the crease on a flat one. */
  const eaveR = r * EAVE_RATIO;
  const eaveRise = Math.max(eps * 3, (eaveR - r) * 0.6);
  p.push(new THREE.Vector2(eaveR, yTop + eps + eaveRise));
  p.push(new THREE.Vector2(0.001, yTop + d.roof));
  return p;
}

/**
 * The true drawn radius of a bin's silhouette, in real metres — the largest
 * `x` the profile ever reaches, not `diameter / 2`.
 *
 * `siloProfile` no longer stays within the nominal radius: the roof eave and
 * the flat-bottom skirt both draw wider than the shell. Anything that needs
 * to know how much room a drawn bin actually occupies — the overlap check,
 * the building-clearance check — has to measure THIS, multiplied by the
 * per-instance `drawScale`, or it is testing a smaller object than the one on
 * screen. See the overlap check in `verify-plant3d.mjs` for exactly what goes
 * wrong when it measures `dims.diameter` instead.
 */
export function profileMaxRadius(d: SiloDims): number {
  let max = 0;
  for (const pt of siloProfile(d)) if (pt.x > max) max = pt.x;
  return max;
}

/** Local Y range over which the contents are shaded. */
export function fillRange(d: SiloDims): [number, number] {
  return [d.elevation, d.elevation + d.hopper + d.barrel];
}