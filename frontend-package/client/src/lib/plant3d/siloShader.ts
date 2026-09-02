/**
 * The patched silo material.
 *
 * Three's `MeshStandardMaterial` is spliced, not replaced: the bins want real
 * PBR shading from the scene's environment map, and the level, the part
 * (wall/roof/hopper/structure/rings/accents) and the fill-status colour are
 * all expressed as a per-fragment cut through that shading rather than as
 * separate geometry or separate materials. See the header of `siloMesh.tsx`
 * for what the passes are and why.
 *
 * THE aPart / aState CONTRACT
 * ----------------------------
 * The geometry carries a per-VERTEX float attribute `aPart` (0 shell wall, 1
 * roof, 2 hopper cone + outlet, 3 structure — legs, braces, skirt, ladder
 * rails, feeder stub, 4 rings/seams/stiffeners/railing, 5 accents such as the
 * hatch). It is shared across every instance, unlike `aColor`/`aFill`/`aFx`/
 * `aState`, which are per-INSTANCE. Object space is real metres, floor at
 * y=0; vertical exaggeration and drawScale are applied outside this shader —
 * as a per-instance uniform scale in `instanceMatrix` and a scene-level
 * `uVerticalStretch` respectively.
 *
 * CORRUGATION PITCH IS A DRAWN-WORLD CONSTANT, NOT AN OBJECT-SPACE ONE.
 *
 * An earlier version of this file keyed the ridge/hatch pitch off raw
 * object-space `position.y`, on the reasoning that a manufacturing pitch
 * "must not stretch." That reasoning proved backwards once measured: this
 * shader has no idea `position.y` is about to be multiplied by a per-instance
 * `drawScale` (up to ~2.9x on the micro hoppers) and a scene-wide 1.55x
 * exaggeration before it reaches a pixel, so an object-space pitch actually
 * produced the OPPOSITE of a constant pitch on screen — the more a bin was
 * size-compressed to stay legible, the finer and denser its ridges looked,
 * which is the one thing corrugated sheet steel never does. Corrugation, the
 * no-data hatch and (were they metre-keyed rather than fraction-of-fill-
 * keyed) the pour bands all key off `vYWorld` now: object height, scaled by
 * the instance's own `instanceMatrix` scale and `uVerticalStretch`, so a
 * 0.28 m pitch reads as 0.28 drawn metres everywhere in the scene, not 0.28
 * pre-exaggeration metres nobody on screen ever sees.
 *
 * Split out of `siloMesh.tsx` so that file exports nothing but its component —
 * see the note in `siloGeometry.ts`. The corrugation texture itself is split
 * further into `textures.ts`, which is Canvas 2D code, not GLSL.
 */
import * as THREE from 'three';
import { makeCorrugationNormal } from './textures';
import { VERTICAL_EXAGGERATION } from './silos';

/**
 * Selection accent. The one colour in this scene that means "you picked
 * this" — never a material colour, never a second accent (no safety yellow
 * or any other non-data hue anywhere else in the shader).
 */
export const ACCENT = '#22d3ee';
/** The line drawn at the surface of the contents. */
const FILL_EDGE = '#f8fafc';
/**
 * Dark steel: legs, braces, skirts, ladder rails, feeder stubs, rings AND
 * accents (hatch rings). Every non-wall structural part, in every family —
 * there is no second, family-specific accent colour. Cyan (`ACCENT`) is the
 * only accent this app has.
 */
const STRUCTURE_COLOR = '#3b4249';
/** Fill-status ramp (DESIGN.md "Fill-status mode"). Mutually exclusive with vMat. */
const STATUS_LOW = '#c9a86a';
const STATUS_MID = '#7f95a8';
const STATUS_HIGH = '#e0a030';
const STATUS_ALARM = '#ef4444';

/**
 * Material family — which archetype's PBR values a group's wall, roof and
 * hopper are drawn with. Fixed per group (per material), never per-instance:
 * a group is entirely galvanised, or entirely painted, and so on, so this is
 * resolved once in JS at material-creation time rather than branched on in
 * the shader.
 */
export type SiloFamily = 0 | 1 | 2 | 3;

const FAMILY_PBR: Record<SiloFamily, { metalness: number; roughness: number }> = {
  0: { metalness: 0.6, roughness: 0.35 }, // galvanised
  1: { metalness: 0.05, roughness: 0.55 }, // painted
  2: { metalness: 0.0, roughness: 0.9 }, // concrete
  3: { metalness: 0.5, roughness: 0.45 }, // tank steel
};

export interface SiloMaterialOpts {
  family?: SiloFamily;
}

/* ------------------------------------------------------------------ */
/* Shared uniforms                                                     */
/* ------------------------------------------------------------------ */

/**
 * Uniform VALUE OBJECTS shared by every material this module creates.
 *
 * Three reads `uniform.value` fresh each frame from whatever object is sitting
 * in `shader.uniforms[name]`. Handing every material the SAME object — rather
 * than a fresh `{ value }` per material carrying an equal number — means a
 * write through one of the setters below is visible to every material next
 * frame, including ones created before the write happened. That is the whole
 * of what makes `setSolidShells`/`setColorMode` work as module-level toggles
 * rather than requiring every call site to hold onto and update its own
 * material references.
 */
const sharedUniforms = {
  uSolidShells: { value: 0 },
  uColorMode: { value: 0 },
  /**
   * `setSiloTime` exists to hold the contract with the geometry worker's
   * beacon shader, not to animate anything here: fills ease on the CPU (see
   * `siloMesh.tsx`), so this value is never read by any GLSL in this file.
   * Kept as a real shared uniform object anyway — a no-op write is safer than
   * a function that silently does nothing the day something DOES want it.
   */
  uTime: { value: 0 },
};

/** Eases `aFill` changes — deliberately not: see `sharedUniforms.uTime` above. */
export function setSiloTime(seconds: number): void {
  sharedUniforms.uTime.value = seconds;
}

/** The see-through toggle. Shell pass renders opaque wall colour when on. */
export function setSolidShells(on: boolean): void {
  sharedUniforms.uSolidShells.value = on ? 1 : 0;
}

/** 0 = material colour (default), 1 = fill-status colour. Never both at once. */
export function setColorMode(mode: 0 | 1): void {
  sharedUniforms.uColorMode.value = mode;
}

/** Colours reused, unchanged, by every material — one THREE.Color each, not per-material. */
const constantUniforms = {
  uEdge: { value: new THREE.Color(FILL_EDGE) },
  uAccent: { value: new THREE.Color(ACCENT) },
  uStructColor: { value: new THREE.Color(STRUCTURE_COLOR) },
  uStatusLow: { value: new THREE.Color(STATUS_LOW) },
  uStatusMid: { value: new THREE.Color(STATUS_MID) },
  uStatusHigh: { value: new THREE.Color(STATUS_HIGH) },
  uStatusAlarm: { value: new THREE.Color(STATUS_ALARM) },
  /**
   * The scene's vertical exaggeration, threaded into the shader rather than
   * hardcoded so it is a value with a name, not a magic 1.55 living in two
   * places that can drift apart. Read from `silos.ts` — the one file that
   * already owns this number — not re-declared here.
   */
  uVerticalStretch: { value: VERTICAL_EXAGGERATION },
};

let corrugationTexture: THREE.Texture | null = null;
function corrugationTex(): THREE.Texture {
  if (!corrugationTexture) corrugationTexture = makeCorrugationNormal();
  return corrugationTexture;
}

/* ------------------------------------------------------------------ */
/* The patched material                                                */
/* ------------------------------------------------------------------ */

const VERT_DECL = /* glsl */ `
attribute float aPart;
attribute vec3 aColor;
attribute float aFill;
attribute vec3 aFx;
attribute vec3 aState;
varying float vPart;
varying vec3 vMat;
varying float vFill;
varying vec3 vFx;
varying vec3 vState;
varying float vFrac;
varying float vYWorld;
varying float vAngle;
varying vec3 vUpDir;
varying float vInstJit;
uniform float uY0;
uniform float uY1;
uniform float uVerticalStretch;
`;

const VERT_BODY = /* glsl */ `
vPart = aPart;
vMat = aColor;
vFill = aFill;
vFx = aFx;
vState = aState;
vFrac = ( position.y - uY0 ) / max( uY1 - uY0, 1e-4 );
/*
 * Height in DRAWN-WORLD metres, not object-space ones.
 *
 * Every instance is placed by translation and a UNIFORM scale baked into
 * instanceMatrix (see writeInstances in siloMesh.tsx) - never a rotation -
 * so the length of instanceMatrix's own first column is exactly that scale.
 * Multiplying by it, and by the scene's own vertical exaggeration, is what
 * makes a 0.28 m corrugation or hatch pitch read as 0.28 m on screen for
 * EVERY bin, whether it is drawn true to size (the 100/200 series) or
 * blown up to ~2.9x true size (the 900-series micro hoppers) to stay
 * legible. Keying this off raw position.y instead - as an earlier version
 * of this file did - produced the opposite of a constant pitch: the more a
 * bin was size-compressed, the finer and denser its ridges looked.
 */
float instScale = length( instanceMatrix[0].xyz );
vYWorld = position.y * instScale * uVerticalStretch;
// Barrel angle, for the corrugation UV and the no-data hatch. Both read this
// rather than a texture UV because a LatheGeometry's own UV.x already runs
// 0..1 around the circumference regardless of true circumference, which would
// tie ridge spacing to segment count instead of to the real 0.28 m pitch.
vAngle = atan( position.z, position.x );
// Every instance here is placed by translation and a UNIFORM scale - never a
// rotation (see writeInstances in siloMesh.tsx) - and the mesh's own group
// only ever carries the scene's vertical scale, also not a rotation. That
// means normalMatrix, which three already uploads as a plain uniform, maps
// object "up" to the same view-space direction for every bin under one
// camera. Carrying that direction as a varying is what lets the fragment
// shader tilt the shading normal for ribbing without building a tangent frame.
vUpDir = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );
/* A stable per-BIN random number, hashed from the instance translation.
   Keyed on world position and NOT on gl_InstanceID, because the mesh re-sorts
   its instances back-to-front whenever the camera moves more than two metres -
   anything keyed to the slot would visibly swap between vessels mid-orbit.
   Kept for the no-data hatch's phase, so 400-series neighbours do not all
   dash in lockstep. */
vInstJit = fract( sin( dot( instanceMatrix[3].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
`;

const FRAG_DECL = /* glsl */ `
varying float vPart;
varying vec3 vMat;
varying float vFill;
varying vec3 vFx;
varying vec3 vState;
varying float vFrac;
varying float vYWorld;
varying float vAngle;
varying vec3 vUpDir;
varying float vInstJit;
uniform vec3 uEdge;
uniform vec3 uAccent;
uniform vec3 uStructColor;
uniform vec3 uStatusLow;
uniform vec3 uStatusMid;
uniform vec3 uStatusHigh;
uniform vec3 uStatusAlarm;
uniform float uShellPass;
uniform float uSeamFrac;
uniform float uSolidShells;
uniform float uColorMode;
uniform float uMetalBase;
uniform float uRoughBase;
uniform sampler2D uCorrugation;
uniform float uCorrWeight;
uniform float uPourWeight;

// Saturation boost: pushes a colour away from its own grey point. Used
// wherever a hue has to survive being seen small, thin or translucent - the
// level ring - rather than leaning on one big flat wash of colour that 131
// overlapping bins blend back down to beige.
vec3 siloVivid( vec3 c, float amount ) {
  float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
  return clamp( mix( vec3( l ), c, amount ), 0.0, 1.0 );
}

// Exact-integer part comparison, safe against float round-trip through an
// attribute: aPart only ever carries 0,1,2,3,4,5, spaced a full unit apart, so
// a 0.5-wide window can never mistake one part for its neighbour.
float siloPartIs( float part, float want ) {
  return step( abs( part - want ), 0.5 );
}

// Fill-status colour ramp (DESIGN.md "Fill-status mode"), independent of
// which material the bin holds. HL overrides the bucket, not the other way
// round, because an alarming bin is the one thing this mode must never let a
// mid-range fill hide.
vec3 siloStatusColor( float fill, float hl ) {
  vec3 c = uStatusMid;
  if ( fill < 0.10 ) c = uStatusLow;
  else if ( fill > 0.90 ) c = uStatusHigh;
  return mix( c, uStatusAlarm, hl );
}
`;

/*
 * `pWall`..`pAccent`, `solid`, `inContents` and `fillColour` are plain locals
 * inside the same `main()` as every later splice point - nothing between
 * `color_fragment` and `opaque_fragment` opens a brace that doesn't close, so
 * they stay in scope for `NORMAL_BODY` and `FRAG_ALPHA` without recomputing.
 * See `meshphysical.glsl.js`'s own include order for why this holds.
 */
const FRAG_BODY = /* glsl */ `
#include <color_fragment>
float pWall   = siloPartIs( vPart, 0.0 );
float pRoof   = siloPartIs( vPart, 1.0 );
float pHopper = siloPartIs( vPart, 2.0 );
float pStruct = siloPartIs( vPart, 3.0 );
float pRing   = siloPartIs( vPart, 4.0 );
float pAccent = siloPartIs( vPart, 5.0 );

/*
 * Pass split by aPart, not by vFrac<0.
 *
 * The roof and every structural part are ALWAYS solid - sheet steel, ladders
 * and rings are never glass - regardless of where they sit relative to the
 * material surface. Only the wall and the hopper cone follow the fill: solid
 * below the surface, shell above it.
 */
float isFillPart = pWall + pHopper;
float isAlwaysSolid = pRoof + pStruct + pRing + pAccent;
float fillSolid = step( vFrac, vFill ) * step( 0.0005, vFill );
float solid = max( isAlwaysSolid, isFillPart * fillSolid );
if ( uShellPass > 0.5 ) {
  if ( solid > 0.5 ) discard;
} else {
  if ( solid < 0.5 ) discard;
}
float inContents = isFillPart * fillSolid;

// Part base colour. diffuseColor.rgb already carries the group's own base
// colour (the family's wall/roof/hopper hex) from three's own colour chunk
// above - everything here recolours ON TOP of that per aPart.
vec3 wallColor = diffuseColor.rgb;
vec3 partColor = wallColor;
partColor = mix( partColor, wallColor * 0.92, pRoof );
partColor = mix( partColor, wallColor * 0.85, pRing );
// Structure AND accents both take the one structural steel colour, in every
// family - there is no safety-yellow or any other second accent hue. Cyan
// (uAccent, used below for hover) is the only accent this scene has.
partColor = mix( partColor, uStructColor, pStruct + pAccent );
diffuseColor.rgb = partColor;

// The fill colour: the bin's own material, or - in status mode - what its
// fill level says, never both at once (PRODUCT.md's non-negotiable #3). A
// no-data bin stays neutral in EITHER mode: vMat is already the "not
// reported" grey for it, so folding back to vMat is a no-op for status mode
// and simply the normal path for material mode.
vec3 fillColour = mix( vMat, siloStatusColor( vFill, vState.x ), uColorMode );
fillColour = mix( fillColour, vMat, vState.z );

// Contents: matte, the fill colour, darkened toward the hopper bottom
// (vFrac -> 0) - the anchor value a real granular pile reads as, deepest
// where the least light reaches down the cone.
float contentsDark = mix( 0.88, 1.0, clamp( vFrac, 0.0, 1.0 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, fillColour * contentsDark, inContents );

// Level ring: a thin bright band at the material surface, wall and hopper
// only, drawn on BOTH passes so it survives the shell's own alpha - including
// when uSolidShells makes the shell fully opaque, which is the one thing that
// mode has to keep true.
float hasLevel = step( 0.004, vFill ) * step( vFill, 0.996 );
float levelBand = 1.0 - smoothstep( 0.0, 0.006, abs( vFrac - vFill ) );
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  mix( uEdge, siloVivid( vMat, 1.6 ), 0.5 ),
  levelBand * hasLevel * isFillPart * 0.9
);

// Legend filter and unmonitored dim (vFx.x) stay. Hover accent (vFx.y) stays,
// at a reduced 0.25 mix now that selection itself moves to a post-process
// outline rather than living on the shell's own colour.
float grey = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( grey ) * 0.36, vFx.x );
diffuseColor.rgb = mix( diffuseColor.rgb, uAccent, vFx.y * 0.25 );
`;

/*
 * Form: part-based PBR, corrugation and the concrete pour bands.
 *
 * Injected after `normal_fragment_begin` rather than at `color_fragment`:
 * that is the first point in the stock shader where `normal`, `roughnessFactor`
 * and `metalnessFactor` all exist, and it runs before `lights_physical_fragment`
 * builds the actual PBR material from them - so every change here is real
 * lighting, not a hand-painted fake highlight. `normal` and `vViewPosition`
 * feed the shell's fresnel alpha at `opaque_fragment` too, which is why this
 * block never reassigns `rim` - that name is spoken for down there.
 */
const NORMAL_BODY = /* glsl */ `
// Structure and accents take the fixed structural PBR regardless of family;
// wall, hopper, roof and rings all take the group's own family values -
// rings share the wall's metal, only its colour is darkened, in FRAG_BODY.
float useStructPBR = pStruct + pAccent;
roughnessFactor = mix( uRoughBase, 0.6, useStructPBR );
metalnessFactor = mix( uMetalBase, 0.5, useStructPBR );

// Corrugation, family 0 (galvanised) only: a real normal map tiled at a
// true 0.28 m pitch in DRAWN-world metres (vYWorld, not object-space vY -
// see the file header), so the ridge spacing reads the same 0.28 m on a
// blown-up 0.45 m micro hopper as on a true-to-size 30 m bulk tank. Faded to
// zero past 90 m of camera distance - at whole-site zoom this many fine
// ribs would alias into shimmer, which is wasted GPU work buying a worse
// picture, not a better one. uCorrWeight is 0 for every other family,
// computed once in JS rather than branched on here.
float camDist = length( vViewPosition );
float corrFade = 1.0 - smoothstep( 60.0, 90.0, camDist );
vec4 corrTex = texture2D( uCorrugation, vec2( vAngle * 4.0, vYWorld / 0.28 / 8.0 ) );
float corrWeight = uCorrWeight * pWall * corrFade;
normal = normalize( normal + vUpDir * ( corrTex.y - 0.5 ) * 0.35 * corrWeight );
diffuseColor.rgb *= 1.0 - corrTex.a * 0.10 * corrWeight;

// Concrete (family 2) gets two faint pour-band grooves instead of ribbing -
// the bulk silos are cast, not sheeted. Already scale-invariant by
// construction: these are keyed on vFrac (a FRACTION of the fill range),
// not a metre height, so they need no vYWorld correction to stay a constant
// 0.05-of-fill-height wide regardless of instance scale.
float pourNear1 = 1.0 - step( 0.025, abs( vFrac - 0.33 ) );
float pourNear2 = 1.0 - step( 0.025, abs( vFrac - 0.66 ) );
float pourBand = clamp( pourNear1 + pourNear2, 0.0, 1.0 );
diffuseColor.rgb *= 1.0 - pourBand * 0.06 * uPourWeight * pWall;

// Contents are matte, not part-family metal: this overrides whatever the
// part-PBR block above set, for the fraction of this fragment that is
// literally the granular fill rather than the vessel wall around it.
roughnessFactor = mix( roughnessFactor, 0.95, inContents );
metalnessFactor = mix( metalnessFactor, 0.0, inContents );
`;

/*
 * Shell as clean acrylic.
 *
 * Alpha is fresnel-weighted alone now - no shade-driven solidifying, which
 * used to turn the shaded flank of every bin into a dark vertical band and
 * made the vessel read as striped plastic rather than glass over steel.
 * Injected here rather than at `color_fragment` because `normal` does not
 * exist yet at that point in three's fragment shader.
 */
const FRAG_ALPHA = /* glsl */ `
// FAKIEH_SILO_SHELL_ALPHA
if ( uShellPass > 0.5 ) {
  float rim = clamp( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );
  if ( uSolidShells > 0.5 ) {
    // The see-through toggle, off: the shell goes opaque at its own wall
    // colour (no tint - solid.rgb is already just the wall here, because
    // anything discard-eligible as "solid" never reaches this branch), and
    // the level band painted into diffuseColor.rgb in FRAG_BODY survives
    // untouched, so "solid" still reads level.
    diffuseColor.a = 1.0;
  } else {
    float clearAlpha = mix( 0.10, 0.85, rim * rim );
    float alphaFloor = mix( 0.18, 0.30, vFx.z );
    diffuseColor.a = max( clearAlpha, alphaFloor );
    // No-data: a floor of its own, doubled contour, and a hatch - "no
    // reading", not "empty" and never a fill.
    diffuseColor.a = max( diffuseColor.a, 0.35 * vState.z );
    diffuseColor.rgb = mix( diffuseColor.rgb, fillColour, mix( 0.05, 0.55, vFx.z ) );

    /*
     * A dark contour at the silhouette edge, not a highlight - the pixel that
     * is turning solid via the fresnel term above also turns into a firm dark
     * value, which holds as a contour against a pale sky, a dark yard floor,
     * or the next bin 15 cm away, none of which this shader can see and none
     * of which it needs to: it is reading its own curvature.
     *
     * Real and unconditional, coded or not: a bright-only fresnel edge against
     * a pale day sky was a documented failure in this project - an uncoded
     * bin's rim would wash out against a light background and the vessel
     * would all but vanish. This is not gated on vFx.z (coded/uncoded) at
     * all, only strengthened further (doubled) for no-data.
     */
    float contourAmount = mix( 1.0, 2.0, vState.z );
    outgoingLight *= 1.0 - pow( rim, 2.6 ) * 0.38 * contourAmount;

    // The 45-degree hatch: dashes the silhouette so "no reading" reads as a
    // different KIND of vessel, not a fainter one. vInstJit phases it per bin
    // so a bank of 400-series neighbours does not dash in lockstep. Keyed on
    // vYWorld (drawn-world metres), same reasoning as the corrugation above -
    // a hatch that stayed on object-space vY would dash at a different
    // apparent density depending on how much a bin's size was compressed.
    float hatch = step( 0.5, fract( vYWorld * 4.0 + vAngle * 3.0 + vInstJit ) ) * vState.z * pWall;
    outgoingLight *= 1.0 - hatch * 0.18;
  }
}
#include <opaque_fragment>
`;

/**
 * The places this patch splices into three's shader.
 *
 * Named here because `String.replace` fails SILENTLY. If three renames a chunk -
 * `output_fragment` became `opaque_fragment` in r152 - the replace matches
 * nothing, the injected code never runs, and the page still renders, just
 * wrongly. `scripts/verify-plant3d.mjs` asserts each marker appears exactly once
 * in the stock shader, which turns that silent failure into a loud one.
 */
export const SILO_ALPHA_SENTINEL = 'FAKIEH_SILO_SHELL_ALPHA';

export const SILO_SHADER_MARKERS = {
  vertex: ['#include <common>', '#include <begin_vertex>'],
  fragment: [
    '#include <common>',
    '#include <color_fragment>',
    '#include <normal_fragment_begin>',
    '#include <opaque_fragment>',
  ],
};

/** Applies the splices. Exported so the checks can exercise the real code. */
export function patchSiloShader(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
    .replace('#include <color_fragment>', FRAG_BODY)
    .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${NORMAL_BODY}`)
    .replace('#include <opaque_fragment>', FRAG_ALPHA);
}

function patchSilo(
  material: THREE.MeshStandardMaterial,
  y0: number,
  y1: number,
  shellPass: boolean,
  seamFrac: number,
  family: SiloFamily,
) {
  const pbr = FAMILY_PBR[family];
  const uniforms = {
    uY0: { value: y0 },
    uY1: { value: y1 },
    uSeamFrac: { value: seamFrac },
    uShellPass: { value: shellPass ? 1 : 0 },
    uMetalBase: { value: pbr.metalness },
    uRoughBase: { value: pbr.roughness },
    uCorrugation: { value: corrugationTex() },
    uCorrWeight: { value: family === 0 ? 1 : 0 },
    uPourWeight: { value: family === 2 ? 1 : 0 },
    ...constantUniforms,
    uSolidShells: sharedUniforms.uSolidShells,
    uColorMode: sharedUniforms.uColorMode,
    uTime: sharedUniforms.uTime,
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchSiloShader(shader);
  };
  /*
   * This override is load-bearing, not boilerplate.
   *
   * three's default cache key is `this.onBeforeCompile.toString()`. Every pass
   * of every family is patched by this same function, so they would all get
   * the identical arrow-function source text - `shellPass` and `family` are
   * closed over and invisible to `toString()` - and would key the same,
   * handing one family's compiled program to another's geometry. Distinct per
   * pass AND per family is what actually keeps that from happening.
   */
  material.customProgramCacheKey = () => `fakieh-silo-${shellPass ? 'shell' : 'solid'}-3-f${family}`;
  return material;
}

/**
 * Height, in the same real metres as `y0`/`y1`, of the hopper-to-barrel
 * seam. `hopper <= 0` (the flat-bottomed outdoor groups) has no such seam, so
 * it resolves to a fraction outside 0..1 - a sentinel rather than a
 * special-cased branch in the shader. Threaded through as `uSeamFrac`
 * unchanged from before; the seam itself is now real geometry (aPart 4)
 * rather than a shader-drawn groove, so nothing in this file reads it back -
 * it stays part of the contract in case a future effect wants it.
 */
function seamFractionOf(y0: number, y1: number, hopper: number): number {
  if (!(hopper > 0)) return -1;
  return hopper / Math.max(y1 - y0, 1e-4);
}

/**
 * `hopper` defaults to 0 (no seam - `seamFractionOf` sentinels out to -1)
 * rather than being required, and `opts` is optional so a call site that has
 * not been updated to pass a family still compiles and renders (as
 * galvanised, family 0, the most common archetype on the plant).
 */
export function makeContentsMaterial(
  shell: string,
  y0: number,
  y1: number,
  hopper = 0,
  opts?: SiloMaterialOpts,
) {
  return patchSilo(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(shell),
      roughness: 0.5,
      metalness: 0.15,
    }),
    y0,
    y1,
    false,
    seamFractionOf(y0, y1, hopper),
    opts?.family ?? 0,
  );
}

export function makeShellMaterial(
  shell: string,
  y0: number,
  y1: number,
  hopper = 0,
  opts?: SiloMaterialOpts,
) {
  return patchSilo(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(shell),
      roughness: 0.28,
      metalness: 0.1,
      /*
       * Depth writing OFF, so you can see through one bin to the bin behind it.
       *
       * That is the whole point of drawing them as glass, and writing depth
       * killed it - the plant went back to being a row of opaque cylinders. The
       * ordering problem it was covering up (three sorts transparent objects,
       * not instances, so a far shell could composite over a near one) is dealt
       * with properly instead: `useInstanceOrder`-style sorting in `siloMesh.tsx`
       * sorts the instances back-to-front as the camera moves. A solid shell
       * (uSolidShells) still does not write depth - the mesh order the sort
       * already provides is what keeps that acceptable; see the note in the
       * report for what that trades away.
       */
      depthWrite: false,
      transparent: true,
      /*
       * FrontSide, not DoubleSide.
       *
       * DoubleSide meant a ray through the middle of ONE bin crossed its front
       * wall and its back wall before reaching anything else, which at these
       * alpha floors compounds fast across a row of bins. Halving the
       * crossings costs nothing - it removes fragment work - and the lathe
       * winds outward, so the same geometry already renders correctly
       * FrontSide on the opaque contents pass.
       */
      side: THREE.FrontSide,
    }),
    y0,
    y1,
    true,
    seamFractionOf(y0, y1, hopper),
    opts?.family ?? 0,
  );
}

/** The material surface itself: flat, opaque, at the real height and radius. */
export function makeSurfaceMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aColor;\nattribute vec3 aFx;\nvarying vec3 vMat;\nvarying vec3 vFx;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aColor;\nvFx = aFx;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vMat;\nvarying vec3 vFx;\nuniform vec3 uAccent2;',
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
// A touch brighter than the wall below it: the surface catches the light, and
// the small step in tone is what makes the level legible from directly above.
diffuseColor.rgb = vMat * 1.12;
float g2 = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( g2 ) * 0.36, vFx.x );
diffuseColor.rgb = mix( diffuseColor.rgb, uAccent2, vFx.y * 0.45 );
`,
      );
    shader.uniforms.uAccent2 = { value: new THREE.Color(ACCENT) };
  };
  material.customProgramCacheKey = () => 'fakieh-silo-surface-2';
  return material;
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

/*
 * A post-process `Outline` (`@react-three/postprocessing`) reads the scene's
 * depth/normal buffers per OBJECT, not per instance - it cannot single out
 * one bin inside an InstancedMesh shared by up to 48 others. The geometry
 * worker builds a small, ordinary (non-instanced) proxy mesh over whichever
 * bin is selected, sized to that bin's own drawn silhouette, and this is its
 * material: the same onBeforeCompile technique as the rest of this file,
 * patched onto MeshStandardMaterial rather than MeshBasicMaterial so a
 * driver that rejects an unlit material in this pipeline is never an issue -
 * `outgoingLight` is fully overwritten below regardless of what lighting the
 * stock chunks computed, so nothing about being "standard" costs anything
 * here. Fresnel-only alpha and colour: the accent halo firms up at the rim
 * and almost vanishes face-on, so it reads as a selection glow around the
 * bin rather than a flat cyan silhouette pasted over it.
 */
const SELECTION_NORMAL_BODY = /* glsl */ `
float selRim = clamp( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );
`;

const SELECTION_ALPHA = /* glsl */ `
outgoingLight = uAccent * ( 0.35 + 0.65 * pow( selRim, 1.5 ) );
diffuseColor.a = mix( 0.18, 0.9, pow( selRim, 1.5 ) );
#include <opaque_fragment>
`;

/**
 * The selected bin's proxy-mesh material: a cyan fresnel glow, the ONLY
 * meaning cyan carries in this scene. Not instanced - one proxy mesh per
 * selection - so it needs none of `aColor`/`aFill`/`aFx`/`aState`/`aPart`.
 */
export function makeSelectionMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ACCENT),
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  material.onBeforeCompile = (shader) => {
    // The SAME Color instance every other material's hover/selection accent
    // uses (see constantUniforms) - one source of truth for "what cyan is".
    shader.uniforms.uAccent = constantUniforms.uAccent;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uAccent;')
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>\n${SELECTION_NORMAL_BODY}`,
      )
      .replace('#include <opaque_fragment>', SELECTION_ALPHA);
  };
  material.customProgramCacheKey = () => 'fakieh-silo-selection-1';
  return material;
}
