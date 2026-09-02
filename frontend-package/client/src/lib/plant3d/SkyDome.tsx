/**
 * The sky — a hand-authored gradient dome, not `drei Sky`.
 *
 * `drei Sky` (Preetham/Rayleigh scattering) never matched this project's art
 * direction: its tone is a function of turbidity/rayleigh/sun-elevation that
 * nobody can reliably reproduce shot to shot, and every attempt to tune it
 * toward DESIGN.md's exact three stops ("horizon `#dfe8f0`, mid `#8fb8dd`,
 * zenith `#3d7cc0`") fought the shader instead of matching it. Plan §4.D.2
 * replaces it outright with this: a large back-side sphere, vertex-coloured
 * by three flat stops the same way a matte-painted cyclorama is, so the sky
 * is exactly the colour `look.ts` says it is, in every screenshot, in every
 * look — day and dusk both use it; night uses it too (with night's own near-
 * black stops) plus `<Stars>` layered on top for texture.
 *
 * ---------------------------------------------------------------------------
 * Why vertex colour and not a fragment gradient
 * ---------------------------------------------------------------------------
 * A fragment-shader gradient would need `onBeforeCompile` on a
 * `MeshBasicMaterial` (the pattern every other patched material in this
 * project already uses) for one uniform lerp — more moving parts than the
 * job needs. A sphere with a reasonable vertical segment count has plenty of
 * vertices to carry a smooth gradient without visible banding (this one uses
 * 48 height segments), and `vertexColors` is a stock three feature with zero
 * shader authoring. Cheaper to build, cheaper to reason about, and there is
 * nothing about this gradient that needs per-fragment precision — it changes
 * slowly across the whole dome by construction.
 *
 * ---------------------------------------------------------------------------
 * Placement
 * ---------------------------------------------------------------------------
 * Radius 1700 — inside the camera's far plane (2400 in `Plant3D.tsx`) so nothing
 * clips it away, comfortably outside the fog's own far distance (max 1400,
 * day) so the dome is never seen through un-fogged sky, and comfortably
 * outside `Stars`' own default radius band so the two do not fight for depth.
 * `depthWrite: false` and `renderOrder = -1` (with the mesh drawn first, its
 * default `renderOrder`) keep it from ever occluding anything or being
 * occluded incorrectly by the ground plane's own -0.02 y-position. `fog:
 * false` on the material — this dome IS the horizon; the scene's exponential
 * fog exists to melt the GROUND into it, not to fog the sky over itself.
 * `toneMapped: false` is kept for correctness in the `?fx=off` / low-power
 * path (no `EffectComposer` at all, so the renderer's own per-object
 * tonemapping chunk is what runs, and this exempts the dome from it there) —
 * but it does NOT exempt the dome from the composer's OWN `ToneMapping`/`LUT`
 * effects when the composer is active, which is the production path. See
 * `SKY_LINEAR_GAIN` below for what that actually required.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Stars } from '@react-three/drei';
import type { Look, TimeOfDay } from './look';

/** Inside the camera's far plane (2400) with margin; outside the fog's
 *  farthest reach (1400, day) and outside `Stars`' default radius. */
const DOME_RADIUS = 1700;

/** Where the horizon->mid gradient stops and mid->zenith begins, as a
 *  fraction of the upper hemisphere (0 = horizon, 1 = zenith straight up).
 *  Small on purpose — "horizon band compressed" (plan §4.D.2): most of a
 *  real sky's colour SHIFT happens close to the horizon, with the rest of
 *  the dome a slow drift toward zenith blue, so most of the sphere's surface
 *  should be carrying the mid->zenith gradient, not the horizon->mid one. */
const HORIZON_BAND = 0.07; /* 0.16 -> 0.07 (2026-09-02): the frame only ever shows the first few degrees of sky, so the blue has to arrive there. */

const tmpColor = new THREE.Color();
const horizonColor = new THREE.Color();
const midColor = new THREE.Color();
const zenithColor = new THREE.Color();

/** Colour at a point `t` up the dome: `t=0` at the horizon ring, `t=1`
 *  straight overhead, `t<0` below the horizon (the small cap of the sphere
 *  that dips under the ground plane, visible only from a very high, steeply
 *  tilted camera) held flat at the horizon colour — there is no fourth stop
 *  for "underground sky", and the ground plane/fog own that territory. */
function gradientAt(t: number, out: THREE.Color): THREE.Color {
  const u = Math.max(0, Math.min(1, t));
  if (u <= HORIZON_BAND) {
    out.copy(horizonColor).lerp(midColor, u / HORIZON_BAND);
  } else {
    out.copy(midColor).lerp(zenithColor, (u - HORIZON_BAND) / (1 - HORIZON_BAND));
  }
  return out;
}

/*
 * MEASURED (2026-09-02): the dome's own `#dfe8f0`/`#8fb8dd`/`#3d7cc0` stops,
 * fed straight through as vertex colours, read as near-white on screen
 * despite `toneMapped: false` on the material — because `toneMapped: false`
 * only skips the tonemapping CHUNK inside this object's own fragment shader
 * (moot anyway: `gl.toneMapping` is `NoToneMapping` while the composer owns
 * it), and the composer's own `ToneMapping`+`LUT` effects run on the WHOLE
 * composited framebuffer afterward with no per-object awareness at all —
 * every pixel the sky dome wrote gets exposure-multiplied and pushed
 * through ACES and the grade exactly like everything else. A `?fx=off`
 * comparison (no `EffectComposer` at all, so the per-object exemption
 * actually applies) read the same stops as a visibly blue (208,222,236) —
 * confirming the stops themselves are correct and the composer path is
 * where the wash happens. Scaling the LINEAR colour down before it ever
 * reaches the vertex buffer is the fix: it lands the SAME on-screen result
 * for a viewer (who only ever sees the composer path in production) without
 * having to fight or special-case the composer's tonemapping. Empirically
 * tuned against the live render rather than derived analytically — ACES'
 * exact response curve as implemented is not the simple textbook fit.
 */
/*
 * ...and that empirical gain (0.42) was tuned at one exposure (0.44) and broke
 * the moment the exposure moved: at 0.8 the dome blew to white on the
 * client's laptop while the ground finally read right. So the compensation is
 * now DERIVED, not tuned: the dome's linear colour is the exact pre-image of
 * the target under three's ACES filmic fit at the look's own exposure, so
 * whatever exposure a look chooses, the sky lands on its design stops.
 *
 * three's ACESFilmicToneMapping (tonemapping_pars_fragment):
 *   c *= exposure / 0.6;  c = In * c;  c = fit(c);  c = Out * c;  clamp
 *   fit(v) = (v*(v+0.0245786) - 0.000090537) / (v*(0.983729*v+0.4329510) + 0.238081)
 * Inverting: y = Out^-1 * target; v solves fit(v) = y per channel (a
 * quadratic, positive root); x = In^-1 * v; colour = x * 0.6 / exposure.
 * The LUT that follows the tone map is a +6% contrast grade and moves the
 * result by a few units of 255 — visible only in a histogram.
 */
const ACES_IN = new THREE.Matrix3().set(
  0.59719, 0.35458, 0.04823,
  0.076, 0.90834, 0.01566,
  0.0284, 0.13383, 0.83777,
);
const ACES_OUT = new THREE.Matrix3().set(
  1.60475, -0.53108, -0.07367,
  -0.10208, 1.10813, -0.00605,
  -0.00327, -0.07276, 1.07602,
);
const ACES_IN_INV = ACES_IN.clone().invert();
const ACES_OUT_INV = ACES_OUT.clone().invert();

function inverseFit(y: number): number {
  /* (1 - 0.983729y) v^2 + (0.0245786 - 0.432951y) v - (0.000090537 + 0.238081y) = 0 */
  const a = 1 - 0.983729 * y;
  const b = 0.0245786 - 0.432951 * y;
  const c = -(0.000090537 + 0.238081 * y);
  const disc = Math.max(0, b * b - 4 * a * c);
  return Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
}

const scratchVec = new THREE.Vector3();

/** The linear colour that the composer's ACES pass maps back onto `target`. */
function preCompensate(target: THREE.Color, exposure: number): THREE.Color {
  const y = scratchVec.set(target.r, target.g, target.b).applyMatrix3(ACES_OUT_INV);
  const v = scratchVec.set(inverseFit(y.x), inverseFit(y.y), inverseFit(y.z));
  const x = v.applyMatrix3(ACES_IN_INV).multiplyScalar(0.6 / Math.max(exposure, 1e-3));
  return target.setRGB(Math.max(0, x.x), Math.max(0, x.y), Math.max(0, x.z));
}

function buildDomeGeometry(horizon: string, mid: string, zenith: string, exposure: number): THREE.BufferGeometry {
  preCompensate(horizonColor.set(horizon), exposure);
  preCompensate(midColor.set(mid), exposure);
  preCompensate(zenithColor.set(zenith), exposure);

  /* 32 radial x 48 height segments: plenty for a smooth gradient at any
     screen size this app renders at, and this geometry is rebuilt only when
     the LOOK changes (a handful of times per session), never per frame. */
  const geo = new THREE.SphereGeometry(DOME_RADIUS, 32, 48);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / DOME_RADIUS; // -1..1
    gradientAt(y, tmpColor);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function SkyDome({ look, timeOfDay }: { look: Look; timeOfDay: TimeOfDay }) {
  const geometry = useMemo(
    () => buildDomeGeometry(look.skyHorizon, look.skyMid, look.skyZenith, look.exposure),
    [look.skyHorizon, look.skyMid, look.skyZenith, look.exposure],
  );

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  );

  /* Not JSX children — both handed to `<mesh>` via `args`, so nothing else
     frees them (the same trap documented on `PitchedRoof`/`ground.tsx`). The
     geometry is rebuilt (new identity) whenever the look's sky stops change,
     so the OLD one from the previous look needs disposing too. */
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <>
      <mesh
        name="sky-dome"
        args={[geometry, material]}
        renderOrder={-1}
        raycast={() => null}
        frustumCulled={false}
      />
      {/* Night only: a scattering of points on top of the (near-black) dome
          for texture — plan §4.D.2 "dome + Stars for night". `radius` kept
          well inside DOME_RADIUS so stars are never behind the dome's own
          geometry; `fade` gives them a soft edge rather than hard points. */}
      {timeOfDay === 'night' && (
        <Stars radius={900} depth={200} count={2600} factor={3.2} saturation={0} fade speed={0} />
      )}
    </>
  );
}

export default SkyDome;
