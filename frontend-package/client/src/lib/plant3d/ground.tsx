/**
 * The site ground: one shader, one draw call, standing in for the plane +
 * road quads that used to be `Ground` in `Plant3D.tsx`.
 *
 * The old ground was a single 340 x 190 m flat-coloured plane with two more
 * flat quads stacked on top for the yard and the roads: four draw calls, no
 * texture, a hard rectangular edge in a dark void. This file replaces all
 * four with one large plane whose colour is computed per-fragment: a
 * poured-concrete apron with expansion joints, a truck yard with painted bay
 * lines, asphalt roads with a dashed centreline, and a plinth ring under
 * every building — patchy and low-contrast, because it is a backdrop for the
 * silos, not the subject. Past the compound it fades to bare terrain and then
 * to the fog colour well short of its own edge, so the plane never visibly
 * "stops".
 *
 * The technique mirrors `siloShader.ts`: `MeshStandardMaterial` is spliced
 * via `onBeforeCompile` rather than replaced with a raw `ShaderMaterial`, so
 * the ground keeps real PBR shading and — the part that actually matters
 * here — keeps receiving the directional light's shadow map for free. A
 * `ShadowMaterial` cannot do that; it has no shading of its own to receive a
 * shadow ONTO.
 *
 * `SITE`, `ROADS` and `BUILDINGS` are read directly from `site.ts` (a pure
 * data module) so the yard, roads, and building plinths are drawn from the
 * same numbers the rest of the scene uses, without Plant3D.tsx having to
 * thread them through as props. Plant3D.tsx only has to hand this component
 * the four per-look colours it already carries on `Look`.
 *
 * One geometry, one material, one splice: everything here is a single
 * `<mesh>`. There is deliberately no split into a `ground.tsx` +
 * `groundShader.ts` pair the way `siloMesh.tsx` / `siloShader.ts` are split
 * (that split exists so `siloMesh.tsx` exports nothing but its component,
 * which is what keeps it inside Vite's Fast Refresh boundary — see the
 * comment on that file). This file was asked for as ONE file and exports
 * several non-component helpers alongside `SiteGround`, so editing it during
 * dev will trigger a full reload instead of a Fast Refresh. Splitting it the
 * same way, later, would fix that; noted rather than done, since the brief
 * was explicit about a single file.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { BUILDINGS, ROADS, SITE } from './site';

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

/** Side length of the single ground plane, metres. Centred on the origin. */
const PLANE_SIZE = 1400;

/** How far the poured apron extends past `SITE.ground`'s own rectangle. */
const APRON_MARGIN = 20;
/** Softness of the apron's own edge, before the bare-terrain blend takes over. */
const APRON_FEATHER = 25;
/** Spacing of the expansion-joint grid drawn across the apron, metres. */
const JOINT_SPACING = 7.3;
/** How far a building's plinth apron extends past its own footprint. */
const PLINTH_MARGIN = 2.5;
/** Spacing of the yard's painted bay-divider lines, metres. */
const BAY_SPACING = 12.4;

/*
 * Radial dissolve into the fog colour, measured as distance BEYOND the
 * apron's own boundary (not from the origin — see `gBoxSDF` below). Starts
 * once you are `FADE_START` past the paved compound and is fully the fog
 * colour by `FADE_END` past it, so nothing beyond that point can show a hard
 * edge no matter where the camera stands.
 */
const FADE_START = 60;
const FADE_END = 260;

/*
 * Camera-distance depth cueing — separate from the radial fade above, and
 * the fix for the actual problem this file was reopened for: at whole-site
 * zoom the camera sits 200-300 m out and almost every pixel in the frame is
 * ground or sky, not silo. The apron/yard/terrain layers below only ever
 * varied with WORLD POSITION (fine texture, joints, tyre tracks), so at that
 * distance they all sample down to one near-flat plateau of tone — measured,
 * not guessed: a whole-site histogram showed a single decile bin holding
 * over a third of the frame. `FADE_START`/`FADE_END` do not fix this; they
 * only govern the ring past the paved compound, and most of the visible
 * ground at whole-site zoom is INSIDE the compound.
 *
 * This instead mixes every ground pixel toward the fog colour by an amount
 * that grows with its distance from the CAMERA (not the origin), using
 * `cameraPosition` — a uniform three declares unconditionally in the
 * `common` chunk for every material, so no new wiring from Plant3D.tsx is
 * needed. The effect is small at zone-view range (cameras tens of metres
 * out) and grows through whole-site range (hundreds of metres), which is
 * exactly backwards from a fixed-in-world-space effect: it tracks whichever
 * view is actually on screen instead of needing a per-zone constant. It also
 * composes for free with each look's own fog colour: by day the pale sky-
 * tinted fog lightens and hazes the far ground, the way real dust-haze
 * bleaches a distant apron; by night the near-black fog darkens it instead,
 * reinforcing "visibility falls off" instead of fighting it.
 */
const DEPTH_NEAR = 50;
const DEPTH_FAR = 300;
/*
 * Tuned down from 0.38 to the plan's 0.30 (§4.E.1): at 0.38 the whole-site
 * frame was pulling ground tone toward the fog colour hard enough to fight
 * the joint/bay contrast raised below — two effects both flattening the same
 * pixels. 0.30 keeps the "ground recedes into haze" read at range without
 * cancelling out the markings that make the near ground legible.
 */
const DEPTH_STRENGTH = 0.3;

/*
 * Ground-marking contrast (§4.E.1): "joints and bay lines raised to 18%
 * contrast so they survive at site range." Named here, rather than left as
 * bare multipliers inline, so the target is traceable to a number instead of
 * a magic constant buried in the shader body below.
 */
/** Expansion joints: apron tone darkened by this fraction. */
const JOINT_CONTRAST = 0.18;
/** Yard border/bay-line paint: blended toward `paint` by this fraction —
 *  raised from the previous 0.6, which under-separated the yard's own mid
 *  grey from its painted lines at whole-site distance. */
const BAY_LINE_CONTRAST = 0.72;

/*
 * Ghost floor-plan grid (§4.E.5): a dot at every `GHOST_GRID_SPACING` metres
 * inside a ghosted building's own footprint, so the room reads as a plan even
 * with no walls and no roof. `GHOST_INSET` keeps the grid off the very edge
 * of the footprint, clear of where the parapet/edge-cage sits.
 */
const GHOST_GRID_SPACING = 8;
const GHOST_DOT_RADIUS = 0.16;
const GHOST_DOT_STRENGTH = 0.3;
const GHOST_INSET = 0.6;

/*
 * Fixed-size uniform arrays. `site.ts` has 2 roads and 5 buildings today;
 * these leave headroom without needing this file edited if either grows a
 * little. If it grows past the headroom, the extras are silently not drawn —
 * which is exactly the kind of silent failure this codebase tries not to
 * ship, so it is turned loud below instead.
 */
const MAX_ROADS = 4;
const MAX_BUILDINGS = 6;

if (ROADS.length > MAX_ROADS) {
  console.warn(
    `ground.tsx: site.ts now has ${ROADS.length} roads but MAX_ROADS is ${MAX_ROADS} — ` +
      `the extra roads will not be drawn on the ground. Raise MAX_ROADS in ground.tsx.`,
  );
}
if (BUILDINGS.length > MAX_BUILDINGS) {
  console.warn(
    `ground.tsx: site.ts now has ${BUILDINGS.length} buildings but MAX_BUILDINGS is ` +
      `${MAX_BUILDINGS} — the extra buildings will not get a plinth. Raise MAX_BUILDINGS in ground.tsx.`,
  );
}

/** Formats a JS number as a GLSL float literal. GLSL ES has no implicit
 *  int -> float conversion at a call site, so `25` where a shader expects a
 *  float is a compile error on some drivers and not others — exactly the
 *  kind of thing that "survives review" per the note in siloShader.ts. */
function glslFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

/* ------------------------------------------------------------------ */
/* The patched shader                                                  */
/* ------------------------------------------------------------------ */

const VERT_DECL = /* glsl */ `
varying vec2 vGroundXZ;
`;

/*
 * World-space XZ, computed directly from `modelMatrix` rather than reused
 * from three's own `vWorldPosition`. three only declares that varying when
 * `USE_ENVMAP`, `USE_TRANSMISSION`, `DISTANCE` or a spot shadow is active —
 * true in this scene today because of the drei `<Environment>`, but nothing
 * here should depend on that staying true. Computing it ourselves is exactly
 * the `aColor`/`aFx`-style pattern siloShader.ts uses for the same reason.
 */
const VERT_BODY = /* glsl */ `
vGroundXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;
`;

const FRAG_DECL = /* glsl */ `
varying vec2 vGroundXZ;

uniform vec3 uGroundColor;
uniform vec3 uYardColor;
uniform vec3 uRoadColor;
uniform vec3 uFogColor;

uniform vec2 uApronCenter;
uniform vec2 uApronHalf;
uniform vec2 uYardCenter;
uniform vec2 uYardHalf;

#define MAX_ROADS ${MAX_ROADS}
uniform int uRoadCount;
uniform vec2 uRoadCenter[ MAX_ROADS ];
uniform vec2 uRoadHalf[ MAX_ROADS ];

#define MAX_BUILDINGS ${MAX_BUILDINGS}
uniform int uBuildingCount;
uniform vec2 uBuildingCenter[ MAX_BUILDINGS ];
uniform vec2 uBuildingHalf[ MAX_BUILDINGS ];

/* Ghost floor-plan grid (§4.E.5) — same fixed-size-array pattern as the
   building plinths above, sized off the same MAX_BUILDINGS: a ghosted
   building is always one of the buildings already in uBuildingCenter. */
uniform int uGhostCount;
uniform vec2 uGhostCenter[ MAX_BUILDINGS ];
uniform vec2 uGhostHalf[ MAX_BUILDINGS ];

/* ---- cheap value noise / fbm, prefixed to stay out of three's way ---- */

float gHash( vec2 p ) {
  p = fract( p * vec2( 123.37, 458.61 ) );
  p += dot( p, p + 41.17 );
  return fract( p.x * p.y );
}

float gNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  float a = gHash( i );
  float b = gHash( i + vec2( 1.0, 0.0 ) );
  float c = gHash( i + vec2( 0.0, 1.0 ) );
  float d = gHash( i + vec2( 1.0, 1.0 ) );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

/* Centred roughly on 0, amplitude falling by half each octave. */
float gFbm( vec2 p ) {
  float v = 0.0;
  float amp = 0.5;
  for ( int gi = 0; gi < 4; gi++ ) {
    v += amp * ( gNoise( p ) - 0.5 );
    p *= 2.02;
    amp *= 0.5;
  }
  return v;
}

/* Exact 2D box SDF (Inigo Quilez) — negative inside, 0 at the edge, distance
   outside. Used both as a soft mask and, unclamped, as the fade distance. */
float gBoxSDF( vec2 p, vec2 c, vec2 h ) {
  vec2 d = abs( p - c ) - h;
  return length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 );
}

float gBoxMask( vec2 p, vec2 c, vec2 h, float feather ) {
  return 1.0 - smoothstep( 0.0, max( feather, 1e-3 ), gBoxSDF( p, c, h ) );
}

/* Thin lines on a regular grid, in LOCAL (already-offset) coordinates. */
float gGridLines( vec2 p, float spacing, float halfWidth ) {
  vec2 g = abs( mod( p + spacing * 0.5, spacing ) - spacing * 0.5 );
  return max( ( 1.0 - smoothstep( 0.0, halfWidth, g.x ) ), ( 1.0 - smoothstep( 0.0, halfWidth, g.y ) ) );
}
`;

/*
 * Everything below is layered onto `diffuseColor.rgb`, in priority order:
 * bare terrain -> paved apron (+ expansion joints) -> yard slab (+ bay lines)
 * -> roads (+ dashed centreline) -> building plinths -> fade to fog. Each
 * later layer overrides the ones before it inside its own mask, so a road
 * that pokes slightly past the apron's soft edge still reads as a road.
 */
const FRAG_BODY = /* glsl */ `
#include <color_fragment>
{
  vec2 p = vGroundXZ;

  /* bare ground beyond the compound: slow rolling noise, pulled halfway to
     the fog colour so it already reads as hazy, distant ground rather than a
     different material glued on at the paving's edge. A real feed mill in
     this climate sits on desert, not grey dirt, so this is given its own
     warm cast rather than sharing the apron's cool concrete tone outright —
     a fixed low-chroma shift off uGroundColor (never enough to read as a
     saturated "desert" colour, per this file's low-chroma rule), plus a
     broad low-frequency layer on top of the existing rolling noise so the
     terrain shows real tonal drift at whole-site scale, not just texture
     that only reads up close. */
  vec3 terrainBase = uGroundColor * vec3( 1.07, 1.0, 0.9 );
  float terrainN = gFbm( p * 0.011 ) + gFbm( p * 0.05 ) * 0.4;
  float terrainMacro = gFbm( p * 0.0035 );
  vec3 terrainColor = mix( terrainBase, uFogColor, 0.15 ) * ( 0.88 + terrainN * 0.16 + terrainMacro * 0.12 );

  /* poured concrete apron: patchy tone, control joints every ${glslFloat(JOINT_SPACING)} m,
     plus a broad weathering/staining pass — spillage, oil, dust drift — big
     enough to still read as tonal structure from the whole-site camera,
     where the fine joint grid and the tight noise above have already fallen
     below a pixel. */
  float apronD = gBoxSDF( p, uApronCenter, uApronHalf );
  float apron = gBoxMask( p, uApronCenter, uApronHalf, ${glslFloat(APRON_FEATHER)} );
  float apronN = gFbm( p * 0.05 ) + gFbm( p * 0.24 ) * 0.3;
  float apronMacro = gFbm( p * 0.007 );
  float joints = gGridLines( p - uApronCenter, ${glslFloat(JOINT_SPACING)}, 0.06 );
  vec3 apronColor = uGroundColor * ( 0.9 + apronN * 0.1 + apronMacro * 0.14 );
  apronColor = mix( apronColor, apronColor * ( 1.0 - ${glslFloat(JOINT_CONTRAST)} ), joints );

  vec3 groundOut = mix( terrainColor, apronColor, apron );

  /* the truck yard: its own slab tone, two tyre-polished lanes, a painted
     perimeter line, bay dividers every ${glslFloat(BAY_SPACING)} m, and the same
     broad staining pass as the apron above (different frequency so the two
     do not visibly tile together at the shared boundary) */
  vec2 yRel = p - uYardCenter;
  float yard = gBoxMask( p, uYardCenter, uYardHalf, 1.5 );
  float yardN = gFbm( p * 0.06 ) + gFbm( p * 0.3 ) * 0.25;
  float yardMacro = gFbm( p * 0.0065 );
  vec3 yardColor = uYardColor * ( 0.9 + yardN * 0.08 + yardMacro * 0.14 );
  float trackOffset = 9.0 + sin( yRel.x * 0.02 ) * 0.8;
  float tracks = ( 1.0 - smoothstep( 0.0, 1.3, abs( abs( yRel.y ) - trackOffset ) ) );
  yardColor *= 1.0 - tracks * 0.12;
  vec3 paint = vec3( 0.85, 0.84, 0.79 );
  float yardBorder = ( 1.0 - smoothstep( 0.0, 0.1, abs( gBoxSDF( yRel, vec2( 0.0 ), uYardHalf - 1.0 ) ) ) );
  float bayX = mod( yRel.x + uYardHalf.x, ${glslFloat(BAY_SPACING)} );
  float bayLine = ( 1.0 - smoothstep( 0.0, 0.1, min( bayX, ${glslFloat(BAY_SPACING)} - bayX ) ) )
                * step( abs( yRel.y ), uYardHalf.y - 1.5 );
  yardColor = mix( yardColor, paint, max( yardBorder, bayLine ) * ${glslFloat(BAY_LINE_CONTRAST)} );

  groundOut = mix( groundOut, yardColor, yard );

  /* roads: asphalt tone, a dashed centreline, two painted edge lines */
  for ( int i = 0; i < MAX_ROADS; i++ ) {
    if ( i >= uRoadCount ) break;
    vec2 c = uRoadCenter[ i ];
    vec2 h = uRoadHalf[ i ];
    float m = gBoxMask( p, c, h, 1.0 );
    if ( m > 0.002 ) {
      vec2 rel = p - c;
      /* which world axis this road runs along */
      float alongX = step( h.y, h.x );
      float s = mix( rel.y, rel.x, alongX );
      float t = mix( rel.x, rel.y, alongX );
      float acrossHalf = mix( h.x, h.y, alongX );
      float rN = gFbm( p * 0.05 );
      vec3 roadColor = uRoadColor * ( 0.94 + rN * 0.08 );
      float dash = step( 0.5, fract( s / 6.0 ) ) * ( 1.0 - smoothstep( 0.0, 0.2, abs( t ) ) );
      float edge = ( 1.0 - smoothstep( 0.0, 0.16, abs( abs( t ) - ( acrossHalf - 0.6 ) ) ) );
      roadColor = mix( roadColor, paint, max( dash, edge ) * 0.55 );
      groundOut = mix( groundOut, roadColor, m );
    }
  }

  /* a darker plinth ring under every building, so none of them look pasted
     onto the plane — this is also what grounds the indoor silo banks, since
     every indoor group sits inside one of these footprints */
  for ( int i = 0; i < MAX_BUILDINGS; i++ ) {
    if ( i >= uBuildingCount ) break;
    float m = gBoxMask( p, uBuildingCenter[ i ], uBuildingHalf[ i ], 1.0 );
    if ( m > 0.002 ) {
      vec3 plinth = mix( apronColor, vec3( 0.0 ), 0.16 );
      groundOut = mix( groundOut, plinth, m );
    }
  }

  /* ghost floor-plan grid: a dot at every ${glslFloat(GHOST_GRID_SPACING)} m
     inside a ghosted building's own footprint, so a see-through building
     reads as a room even with no walls and no roof drawn at all. Layered
     after the plinth so it sits on top of that darker ring rather than under
     it. GHOST_INSET keeps the dots off the very edge of the footprint. */
  for ( int i = 0; i < MAX_BUILDINGS; i++ ) {
    if ( i >= uGhostCount ) break;
    vec2 c = uGhostCenter[ i ];
    vec2 h = uGhostHalf[ i ] - ${glslFloat(GHOST_INSET)};
    if ( h.x <= 0.0 || h.y <= 0.0 ) continue;
    float insideD = gBoxSDF( p, c, h );
    if ( insideD > 0.0 ) continue;
    vec2 rel = p - c;
    vec2 cell = mod( rel + ${glslFloat(GHOST_GRID_SPACING)} * 0.5, ${glslFloat(GHOST_GRID_SPACING)} ) - ${glslFloat(GHOST_GRID_SPACING)} * 0.5;
    float dot = 1.0 - smoothstep( 0.0, ${glslFloat(GHOST_DOT_RADIUS)}, length( cell ) );
    groundOut = mix( groundOut, groundOut * 0.35, dot * ${glslFloat(GHOST_DOT_STRENGTH)} );
  }

  /* depth cueing toward the camera, not the origin — see the note on
     DEPTH_NEAR/DEPTH_FAR above. Applied everywhere, including inside the
     paved compound, which the radial fade below never touches. Deliberately
     BEFORE that fade: past the compound the two stack (this adds a little
     more pull toward the fog colour on top of what the radial fade already
     gives), which is fine because the radial fade fully owns the outcome
     past its own FADE_END regardless of what this contributes first. */
  float camDist = distance( cameraPosition.xz, p );
  float depthMix = smoothstep( ${glslFloat(DEPTH_NEAR)}, ${glslFloat(DEPTH_FAR)}, camDist );
  groundOut = mix( groundOut, uFogColor, depthMix * ${glslFloat(DEPTH_STRENGTH)} );

  /* dissolve into the fog colour well inside the mesh's own edge, so there
     is no line where the ground "stops" regardless of camera distance */
  float beyond = max( apronD, 0.0 );
  float edgeFade = smoothstep( ${glslFloat(FADE_START)}, ${glslFloat(FADE_END)}, beyond );
  groundOut = mix( groundOut, uFogColor, edgeFade );

  diffuseColor.rgb = groundOut;
}
`;

/**
 * The places this patch splices into three's shader — named for the same
 * reason `SILO_SHADER_MARKERS` is named in `siloShader.ts`: `String.replace`
 * fails SILENTLY if three ever renames one of these chunks, and a script
 * asserting each marker appears exactly once in `THREE.ShaderLib.physical`
 * turns that into a loud failure instead. Wired into
 * `scripts/verify-plant3d.mjs` ("every ground shader splice point exists
 * exactly once").
 */
export const GROUND_SHADER_MARKERS = {
  vertex: ['#include <common>', '#include <begin_vertex>'],
  fragment: ['#include <common>', '#include <color_fragment>'],
};

/** Applies the splices. Exported so a check can exercise the real code. */
export function patchGroundShader(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
    .replace('#include <color_fragment>', FRAG_BODY);
}

/* ------------------------------------------------------------------ */
/* Static layout uniforms, read once from site.ts                      */
/* ------------------------------------------------------------------ */

export interface GroundStatics {
  apronCenter: THREE.Vector2;
  apronHalf: THREE.Vector2;
  yardCenter: THREE.Vector2;
  yardHalf: THREE.Vector2;
  roadCount: number;
  roadCenter: THREE.Vector2[];
  roadHalf: THREE.Vector2[];
  buildingCount: number;
  buildingCenter: THREE.Vector2[];
  buildingHalf: THREE.Vector2[];
}

function filledVec2Array(n: number, x: number, y: number): THREE.Vector2[] {
  return Array.from({ length: n }, () => new THREE.Vector2(x, y));
}

/** Pure: bakes `SITE` / `ROADS` / `BUILDINGS` into the fixed-size arrays the
 *  shader expects. Exported so it can be exercised on its own. */
export function buildGroundStatics(): GroundStatics {
  const roadCenter = filledVec2Array(MAX_ROADS, 0, 0);
  /* -1,-1 half-size can never contain a point, so a padding slot the shader
     loop skips via `uRoadCount` is also harmless if that ever changes. */
  const roadHalf = filledVec2Array(MAX_ROADS, -1, -1);
  ROADS.slice(0, MAX_ROADS).forEach((r, i) => {
    roadCenter[i].set(r.x, r.z);
    roadHalf[i].set(r.length / 2, r.width / 2);
  });

  const buildingCenter = filledVec2Array(MAX_BUILDINGS, 0, 0);
  const buildingHalf = filledVec2Array(MAX_BUILDINGS, -1, -1);
  BUILDINGS.slice(0, MAX_BUILDINGS).forEach((b, i) => {
    buildingCenter[i].set(b.x, b.z);
    buildingHalf[i].set(b.length / 2 + PLINTH_MARGIN, b.width / 2 + PLINTH_MARGIN);
  });

  return {
    apronCenter: new THREE.Vector2(0, 0),
    apronHalf: new THREE.Vector2(SITE.ground.length / 2 + APRON_MARGIN, SITE.ground.width / 2 + APRON_MARGIN),
    yardCenter: new THREE.Vector2(SITE.yard.x, SITE.yard.z),
    yardHalf: new THREE.Vector2(SITE.yard.length / 2, SITE.yard.width / 2),
    roadCount: Math.min(ROADS.length, MAX_ROADS),
    roadCenter,
    roadHalf,
    buildingCount: Math.min(BUILDINGS.length, MAX_BUILDINGS),
    buildingCenter,
    buildingHalf,
  };
}

/**
 * Bakes whichever buildings are currently ghosted into the same fixed-size
 * `uGhostCenter`/`uGhostHalf` shape the statics above use — separate from
 * `buildGroundStatics` because this one is NOT static: it depends on the
 * `ghostedIds` prop, which changes as the operator toggles see-through mode
 * or frames a zone. Pure, so it can be exercised on its own by a check.
 */
export function buildGhostStatics(ghostedIds: readonly string[]): {
  ghostCount: number;
  ghostCenter: THREE.Vector2[];
  ghostHalf: THREE.Vector2[];
} {
  const ghostCenter = filledVec2Array(MAX_BUILDINGS, 0, 0);
  const ghostHalf = filledVec2Array(MAX_BUILDINGS, -1, -1);
  const ghosted = BUILDINGS.filter((b) => ghostedIds.includes(b.id)).slice(0, MAX_BUILDINGS);
  ghosted.forEach((b, i) => {
    ghostCenter[i].set(b.x, b.z);
    ghostHalf[i].set(b.length / 2, b.width / 2);
  });
  return { ghostCount: ghosted.length, ghostCenter, ghostHalf };
}

/* ------------------------------------------------------------------ */
/* The material                                                        */
/* ------------------------------------------------------------------ */

export interface GroundUniforms {
  uGroundColor: { value: THREE.Color };
  uYardColor: { value: THREE.Color };
  uRoadColor: { value: THREE.Color };
  uFogColor: { value: THREE.Color };
  uApronCenter: { value: THREE.Vector2 };
  uApronHalf: { value: THREE.Vector2 };
  uYardCenter: { value: THREE.Vector2 };
  uYardHalf: { value: THREE.Vector2 };
  uRoadCount: { value: number };
  uRoadCenter: { value: THREE.Vector2[] };
  uRoadHalf: { value: THREE.Vector2[] };
  uBuildingCount: { value: number };
  uBuildingCenter: { value: THREE.Vector2[] };
  uBuildingHalf: { value: THREE.Vector2[] };
  uGhostCount: { value: number };
  uGhostCenter: { value: THREE.Vector2[] };
  uGhostHalf: { value: THREE.Vector2[] };
}

/** Builds the patched ground material once. Colours start neutral; the
 *  component updates them in place as the per-look props change, so a
 *  time-of-day switch never recompiles the shader. */
export function makeGroundMaterial(): { material: THREE.MeshStandardMaterial; uniforms: GroundUniforms } {
  const statics = buildGroundStatics();
  const uniforms: GroundUniforms = {
    /*
     * Defaults tuned toward DESIGN.md's day apron/yard/road/fog values
     * (§"Scene palette (day look)") rather than the old placeholder tones —
     * these are only what paints for the one frame before the `ground`/
     * `yard`/`road`/`fog` props (driven by `look.ts`, which this file does
     * not own) land in the effect below, but there is no reason for that
     * frame to be a colour nobody asked for.
     */
    uGroundColor: { value: new THREE.Color('#b9b5ad') },
    uYardColor: { value: new THREE.Color('#a8a49b') },
    uRoadColor: { value: new THREE.Color('#4a4d52') },
    uFogColor: { value: new THREE.Color('#dfe8f0') },
    uApronCenter: { value: statics.apronCenter },
    uApronHalf: { value: statics.apronHalf },
    uYardCenter: { value: statics.yardCenter },
    uYardHalf: { value: statics.yardHalf },
    uRoadCount: { value: statics.roadCount },
    uRoadCenter: { value: statics.roadCenter },
    uRoadHalf: { value: statics.roadHalf },
    uBuildingCount: { value: statics.buildingCount },
    uBuildingCenter: { value: statics.buildingCenter },
    uBuildingHalf: { value: statics.buildingHalf },
    uGhostCount: { value: 0 },
    uGhostCenter: { value: filledVec2Array(MAX_BUILDINGS, 0, 0) },
    uGhostHalf: { value: filledVec2Array(MAX_BUILDINGS, -1, -1) },
  };

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchGroundShader(shader);
  };
  /* Own cache key, same reasoning as siloShader.ts: three's default cache key
     is `onBeforeCompile.toString()`, and there is nothing here that varies
     between instances of this material to make that ambiguous today — but a
     stable explicit key costs nothing and is the established convention. */
  material.customProgramCacheKey = () => 'fakieh-ground-1';

  return { material, uniforms };
}

/* ------------------------------------------------------------------ */
/* The component                                                       */
/* ------------------------------------------------------------------ */

export interface SiteGroundProps {
  /** apron / bare-terrain base tone — `Look.ground` */
  ground: string;
  /** truck yard slab tone — `Look.yard` */
  yard: string;
  /** road asphalt tone — `Look.road` */
  road: string;
  /** scene fog colour, also the horizon this ground dissolves into — `Look.fog` */
  fog: string;
  /**
   * `SiteBuilding['id']`s currently drawn ghosted (see-through). The ground
   * draws a floor-plan dot grid inside each one's footprint — see the ghost
   * grid note on `GHOST_GRID_SPACING` above — so a room with no walls and no
   * roof still reads as a room. Defaults to none.
   */
  ghostedIds?: readonly string[];
}

/**
 * The whole ground: apron, yard, roads, building plinths, the ghost
 * floor-plan grid and the fade to the horizon, as one plane and one draw
 * call. Replaces `Ground` (the base plane) and the separate yard/road quads
 * it used to sit next to.
 *
 * Kept outside any `scale={[1, VERTICAL_EXAGGERATION, 1]}` wrapper, same as
 * the component it replaces — the ground is flat and stays outside that
 * group in `Plant3D.tsx`.
 */
export function SiteGround({ ground, yard, road, fog, ghostedIds }: SiteGroundProps) {
  const { material, uniforms } = useMemo(() => makeGroundMaterial(), []);
  const geometry = useMemo(() => new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE), []);

  /* Neither is a JSX child here — both are handed to `<mesh>` via `args`, so
     nothing else frees them. Same trap `PitchedRoof` and `siloMesh.tsx`
     already document in this codebase. */
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    uniforms.uGroundColor.value.set(ground);
    uniforms.uYardColor.value.set(yard);
    uniforms.uRoadColor.value.set(road);
    uniforms.uFogColor.value.set(fog);
  }, [uniforms, ground, yard, road, fog]);

  /* `ghostedIds` is a prop, not a ref — a new array identity every render is
     the normal case for a derived id list, so this keys off its CONTENT
     (join), not the array reference, to avoid rewriting three fixed-size
     uniform arrays on every frame for no reason. */
  const ghostKey = (ghostedIds ?? []).join(',');
  useEffect(() => {
    const { ghostCount, ghostCenter, ghostHalf } = buildGhostStatics(ghostedIds ?? []);
    uniforms.uGhostCount.value = ghostCount;
    for (let i = 0; i < ghostCenter.length; i++) {
      uniforms.uGhostCenter.value[i].copy(ghostCenter[i]);
      uniforms.uGhostHalf.value[i].copy(ghostHalf[i]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniforms, ghostKey]);

  return (
    <mesh args={[geometry, material]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow />
  );
}
