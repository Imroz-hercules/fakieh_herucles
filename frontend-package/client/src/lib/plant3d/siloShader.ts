/**
 * The patched silo material.
 *
 * Three's `MeshStandardMaterial` is spliced, not replaced: the bins want real
 * PBR shading from the scene's environment map, and the level is expressed as a
 * per-fragment cut through that shading rather than as separate geometry. See
 * the header of `siloMesh.tsx` for what the three passes are and why.
 *
 * Split out of `siloMesh.tsx` so that file exports nothing but its component —
 * see the note in `siloGeometry.ts`.
 */
import * as THREE from 'three';

/** Selection accent. The one colour in this scene that means "you picked this". */
export const ACCENT = '#22d3ee';
/** The line drawn at the surface of the contents. */
const FILL_EDGE = '#f8fafc';

/* ------------------------------------------------------------------ */
/* The patched material                                                */
/* ------------------------------------------------------------------ */

const VERT_DECL = /* glsl */ `
attribute vec3 aColor;
attribute float aFill;
attribute vec3 aFx;
varying vec3 vMat;
varying float vFill;
varying vec3 vFx;
varying float vFrac;
varying float vY;
varying vec3 vUpDir;
varying float vInstJit;
uniform float uY0;
uniform float uY1;
`;

const VERT_BODY = /* glsl */ `
vMat = aColor;
vFill = aFill;
vFx = aFx;
vFrac = ( position.y - uY0 ) / max( uY1 - uY0, 1e-4 );
// Raw object-space height, in real metres — never drawScale, never the scene's
// vertical exaggeration. Corrugation pitch is a manufacturing constant, not
// something that should stretch with the compressed indoor bins or the whole
// site's 1.55x exaggeration, so it is keyed off this rather than off vFrac.
vY = position.y;
// Every instance here is placed by translation and a UNIFORM scale — never a
// rotation (see writeInstances in siloMesh.tsx) — and the mesh's own group
// only ever carries the scene's vertical scale, also not a rotation. That
// means normalMatrix, which three already uploads as a plain uniform, maps
// object "up" to the same view-space direction for every bin under one
// camera. Carrying that direction as a varying is what lets the fragment
// shader tilt the shading normal for ribbing without building a tangent frame.
vUpDir = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );
/* A stable per-BIN random number, hashed from the instance translation.
   Keyed on world position and NOT on gl_InstanceID, because the mesh re-sorts
   its instances back-to-front whenever the camera moves more than two metres —
   anything keyed to the slot would visibly swap between vessels mid-orbit. */
vInstJit = fract( sin( dot( instanceMatrix[3].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vMat;
varying float vFill;
varying vec3 vFx;
varying float vFrac;
varying float vY;
varying vec3 vUpDir;
varying float vInstJit;
/* uY0 is the elevation of the storage floor. The skirt shading below grades
   against it, so the FRAGMENT stage needs it too — it used to be declared only
   in the vertex stage, and the whole program failed to compile. */
uniform float uY0;
uniform vec3 uEdge;
uniform vec3 uAccent;
uniform float uShellPass;
uniform float uSeamFrac;

// Saturation boost: pushes a colour away from its own grey point. Used
// wherever a hue has to survive being seen small, thin or translucent — the
// fill band and the shell's rim glow — rather than leaning on one big flat
// wash of colour that 131 overlapping bins blend back down to beige.
vec3 siloVivid( vec3 c, float amount ) {
  float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
  return clamp( mix( vec3( l ), c, amount ), 0.0, 1.0 );
}

// Proximity to a structural seam line, as a 0..1 band with a fixed width in
// vFrac units. Edges are literal on purpose — see the note above FRAG_BODY.
float siloRingAt( float d ) {
  return 1.0 - smoothstep( 0.0, 0.012, d );
}
`;

/*
 * `inContents` is guarded three ways on purpose:
 *   step( vFrac, vFill )   at or below the material surface
 *   step( 0.0, vFrac )     above the support, which is structure and never fills
 *   step( 0.0005, vFill )  an empty bin holds nothing at all, rather than the
 *                          hairline that step(0,0)=1 would otherwise paint
 */
const FRAG_BODY = /* glsl */ `
#include <color_fragment>
float inContents = step( vFrac, vFill ) * step( 0.0, vFrac ) * step( 0.0005, vFill );
float isStructure = 1.0 - step( 0.0, vFrac );
/*
 * The roof is OPAQUE, and that is worth more than it looks.
 *
 * It used to sit in the translucent pass, which had three consequences. A real
 * silo roof is sheet steel and reading through it looks like nothing on a
 * plant. It gave the vessel no top edge, so a bank of bins had no upper
 * boundary against the sky. And — the one that actually mattered — a
 * translucent surface writes no depth, so on the 117 bins that hold nothing
 * the ONLY thing writing depth was the little support skirt: no ambient
 * occlusion, no contact with anything, no gap darkening between neighbours.
 * The bank was flat because more than half of it was invisible to every
 * shading pass that needs a depth buffer.
 *
 * An opaque cap gives every bin a lit top and a dark underside, and hands the
 * AO pass something to work with. Nothing is lost: you never needed to see
 * through the roof to read a level.
 */
float isRoof = step( 1.0, vFrac );
float solid = max( inContents, max( isStructure, isRoof ) );
if ( uShellPass > 0.5 ) {
  if ( solid > 0.5 ) discard;
} else {
  if ( solid < 0.5 ) discard;
}
// The contents take the material colour at full strength.
diffuseColor.rgb = mix( diffuseColor.rgb, vMat, inContents );

// And so does the glass above them, at about a third.
//
// Almost every bin in this plant is nearly empty, so with a neutral shell the
// whole site read as a field of grey cylinders and answered neither question an
// operator has. Tinting the glass means an empty maize silo is a green vessel
// and an empty soya silo is a blue one — you can see WHAT a bin is for from
// across the site, and how much is in it as you come closer. The two questions
// keep separate channels: hue says what, the solid part says how much.
//
// Kept well under 1.0 so glass still reads as glass, and so a bin with no
// material assigned (a grey vMat) stays a neutral vessel rather than a hole.
// Turned DOWN from a flat 0.62: a flat wash across 131 overlapping translucent
// shells is exactly what averaged into beige at whole-site zoom. The colour
// that has to survive that averaging now lives mostly in the rim glow and the
// fill band below — a saturated, alpha-heavy signal at the silhouette and at
// the level line reads through overlap in a way a flat interior wash cannot.
/*
 * Strength depends on whether there IS a material.
 *
 * 0.4 was chosen against a worry that never applied: that 131 overlapping
 * coloured shells would average into beige. Only TEN bins in this plant carry
 * a material code — the API says so — so ten shells cannot average into
 * anything, and every one of them was being tinted timidly to protect against
 * a crowd that does not exist. The other 121 were being tinted with the
 * neutral grey that stands for "the plant has not said", which does nothing
 * except wash them slightly.
 *
 * So: a named material reads as that material, hard enough to see across the
 * site. An unnamed one stays an honest neutral vessel — the absence of a
 * colour is itself the correct signal, and inventing one would be inventing
 * plant state.
 */
float tint = uShellPass * ( 1.0 - inContents );
/* 0.85 -> 0.92: still short of a flat paint job, but the ten coded bins were
   losing most of even an 0.85 mix once the shell's low fresnel-driven alpha
   (see FRAG_ALPHA) diluted it against whatever sat behind the glass. That
   alpha floor is where the real fix lives; this ceiling is raised alongside
   it so the RGB the alpha pass has to work with is as saturated as it can be
   without the glass reading as solid paint. */
diffuseColor.rgb = mix( diffuseColor.rgb, vMat, tint * mix( 0.06, 0.92, vFx.z ) );
// smoothstep with edge0 > edge1 is UNDEFINED in GLSL ES. It happens to behave
// as an inverse ramp on most desktop drivers, which is exactly why it survives
// review; on other drivers the highlight band can invert or vanish.
float band = ( 1.0 - smoothstep( 0.0, 0.02, abs( vFrac - vFill ) ) )
           * step( 0.0, vFrac ) * step( 0.004, vFill ) * step( vFill, 0.996 );
// The fill line doubles as the material signal now, not just a white gauge
// mark: a saturated cut of the bin's own colour, so the one place every eye
// is already drawn to (the meniscus) also answers "what is this".
diffuseColor.rgb = mix( diffuseColor.rgb, mix( uEdge, siloVivid( vMat, 1.8 ), 0.35 + 0.6 * vFx.z ), band * 0.85 );
float grey = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( grey ) * 0.36, vFx.x );
diffuseColor.rgb = mix( diffuseColor.rgb, uAccent, vFx.y * 0.45 );
diffuseColor.rgb *= 1.0 + vFx.y * 0.3;
`;

/*
 * Form: ribbing, seams and per-zone material.
 *
 * `isStructure` and `inContents` above are plain locals inside the same
 * `main()` — nothing between `color_fragment` and here opens a brace that
 * doesn't close, so they are still in scope and don't need recomputing.
 *
 * Injected after `normal_fragment_begin` rather than at `color_fragment`:
 * that is the first point in the stock shader where `normal`, `roughnessFactor`
 * and `metalnessFactor` all exist, and it runs before `lights_physical_fragment`
 * builds the actual PBR material from them — so every change here is real
 * lighting, not a hand-painted fake highlight. `normal` and `vViewPosition`
 * feed the shell's fresnel alpha at `opaque_fragment` too, which is why this
 * block never reassigns `rim` — that name is already spoken for down there.
 */
const NORMAL_BODY = /* glsl */ `
float siloWall = step( 0.0, vFrac ) * ( 1.0 - step( 1.0, vFrac ) );
float siloRoof = step( 1.0, vFrac );
float siloSkirt = 1.0 - siloWall - siloRoof;

// Horizontal ribbing, real feed-mill corrugation pitch (~0.28 m), phased on
// vY so it is the same physical spacing on a 0.45 m micro hopper and a 30 m
// bulk tank regardless of how compressed either is on screen. Faded out with
// distance: at whole-site zoom this many fine ribs would alias into shimmer,
// which is wasted GPU work buying a worse picture, not a better one.
float camDist = length( vViewPosition );
float corrFade = 1.0 - smoothstep( 40.0, 140.0, camDist );
float siloRidge = cos( vY * 22.4 + vInstJit * 6.28318 ) * siloWall * corrFade;
normal = normalize( normal + vUpDir * siloRidge * 0.16 );
/* Was 0.06 — a six percent wobble, which is invisible. Real ribbed panel is
   nearer a quarter, and the trough is genuinely self-shadowed, so a small
   negative term stands in for the occlusion a normal-tilt alone cannot give:
   without it the ribs vanish the moment the light comes from the front.
   0.22/0.05 -> 0.26/0.08: measured, not guessed — a histogram of the
   rendered frame (scripts in the report) showed the SUBJECT sitting in one
   narrow luminance band while sky and ground spanned the full range either
   side of it. Corrugation is the one piece of texture every one of the 131
   bins carries regardless of material or fill, so it is the cheapest place
   to put real tonal variation onto the subject itself rather than asking the
   background to keep doing that work alone. */
diffuseColor.rgb *= 1.0 + siloRidge * 0.26 - ( 1.0 - siloRidge ) * 0.08 * siloWall * corrFade;
roughnessFactor = clamp( roughnessFactor - siloRidge * 0.05, 0.05, 1.0 );
// Galvanised steel reads a little more reflective than the base PBR values,
// which were tuned for the glass/grain look rather than the wall itself.
metalnessFactor = mix( metalnessFactor, 0.5, siloWall );

// Ring seams: hopper-to-barrel (uSeamFrac, -1 and so never hit on a
// flat-bottomed bin), barrel-to-roof (vFrac 1) and plinth-to-hopper (vFrac 0).
// A dark groove line reads under any lighting, not just where a highlight
// happens to land, which is what a real welded or bolted seam looks like.
float dSeamHB = abs( vFrac - uSeamFrac );
float dSeamTop = abs( vFrac - 1.0 );
float dSeamBase = abs( vFrac );
float siloSeam = max( siloRingAt( dSeamHB ), max( siloRingAt( dSeamTop ), siloRingAt( dSeamBase ) ) );
/* 0.22 read as a soft shading gradient rather than a break in the form — bumped
   so the hopper-to-barrel and barrel-to-roof lines register as an actual joint
   between two silhouette features, the cone and the cap, rather than one smooth
   taper (04-zone-raw.png: the roof-to-wall line all but disappears at present). */
diffuseColor.rgb *= 1.0 - siloSeam * 0.34;

// The roof cone is a metal cap, not more of the vessel: shinier, a little
// more reflective, and pulled toward a neutral steel tone so it reads as
// structure rather than as the bin's own material colour going up and over.
roughnessFactor = mix( roughnessFactor, 0.22, siloRoof );
metalnessFactor = mix( metalnessFactor, 0.55, siloRoof );
// The roof is the one part of every bin that is opaque, flat and nearly
// facing a camera at 20 degrees of elevation, and it is not composited
// behind anyone else's glass. It is therefore the only place a material
// colour is guaranteed to read at whole-site zoom — including on the ~117
// bins that have no level at all and so have no coloured contents to show.
/*
 * The roof is a locator, not just a cap.
 *
 * It is the one surface on every bin that is opaque, flat, not composited
 * behind anyone else's glass, and drawn regardless of whether the bin holds
 * anything at all (see the long comment above isRoof) — which makes it the
 * one place a coded bin's colour is guaranteed to reach the eye at whole-site
 * zoom, where the shell's translucency and 131 overlapping vessels work
 * against it. roofMatWeight and the vivid amount both key off vFx.z
 * alone: for the 121 uncoded bins vMat is already the neutral grey that
 * means "not reported", so pulling their weight down to 0.32 only makes an
 * already-neutral cap a little more consistently steel-toned. For the ten
 * coded bins it pushes the cap hard toward a saturated, unmistakable colour —
 * effectively a small flag standing above the grey field, findable without
 * having to isolate the material in the legend first.
 */
float roofMatWeight = mix( 0.32, 0.84, vFx.z );
vec3 roofSteel = mix( vec3( 0.55, 0.58, 0.6 ), siloVivid( vMat, mix( 1.4, 2.1, vFx.z ) ), roofMatWeight );
/* 0.5 left the cap close enough to the wall's own tone that a bin read as one
   smooth surface top to bottom (07-zone-yard.png). Pushed toward the steel
   value so the cap is a recognisable, distinct silhouette feature — the same
   cue a real corrugated bin gives with its sheet-metal cone against a painted
   or galvanised wall — rather than more of the vessel going up and over. */
diffuseColor.rgb = mix( diffuseColor.rgb, roofSteel, siloRoof * 0.65 );

// The hopper foot and plinth are the anchor value the brief asked for: dark,
// matte structure, darker still right at grade like a base plate rather than
// a lit vessel wall.
float siloGrade = 1.0 - clamp( vY / max( uY0, 1e-4 ), 0.0, 1.0 );
diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.32, siloSkirt * ( 0.6 + 0.4 * siloGrade ) );
/* A bank of 22 identical vessels is what reads as an appliance. Two free
   variations off the same hash: a permanent dust bleed under the outlet on
   roughly half the bins, and a small brightness jitter. Both confined to the
   skirt and to luminance, so neither can disturb material colour. */
float stainAmt = smoothstep( 0.55, 1.0, vInstJit );
float stainFade = 1.0 - clamp( vY / max( uY0 * 0.6, 1e-4 ), 0.0, 1.0 );
diffuseColor.rgb *= 1.0 - stainAmt * stainFade * 0.35 * siloSkirt;
diffuseColor.rgb *= 0.92 + 0.16 * vInstJit;
roughnessFactor = mix( roughnessFactor, 0.85, siloSkirt );
metalnessFactor = mix( metalnessFactor, 0.05, siloSkirt );

// A saturated, rim-weighted hue on the wall, so colour survives translucent
// overlap from across the site instead of averaging into beige — see the
// note above the tint blend in FRAG_BODY. Fresnel-weighted and alpha-heavy at
// the rim already (FRAG_ALPHA), so this is exactly the pixels least likely to
// get diluted by whatever bin happens to sit behind it.
float siloFres = 1.0 - abs( dot( normal, normalize( vViewPosition ) ) );
/* This was gated on uShellPass, so the metal sheen and the hue boost landed
   only on the EMPTY part of a bin. The filled part — the data the whole view
   exists to show — was the flattest thing on screen. Both passes get it now,
   weaker on the solid contents so the glass still reads as glass. */
/* mix(1.0, 1.4, vFx.z): a further boost for the ten coded bins specifically,
   stacked on top of the uShellPass term above. Redundant with the vFx.z gate
   on the line below in the algebra sense (vFx.z is always exactly 0 or 1, so
   multiplying by it twice changes nothing for either value) but not in
   intent: this is the one term that answers "how hard does a NAMED material
   glow", kept separate from "which pass is this" so the two can be tuned
   independently later without re-deriving the interaction. */
float siloRimStrength = mix( 0.22, 0.5, uShellPass ) * mix( 1.0, 1.4, vFx.z );
/* The rim glow is a pure material signal, so it only fires where there IS a
   material — otherwise it was painting a neutral grey onto a neutral grey. */
diffuseColor.rgb = mix( diffuseColor.rgb, siloVivid( vMat, 2.0 ), siloWall * pow( siloFres, 1.6 ) * siloRimStrength * vFx.z );
`;

/*
 * Glass, not fog.
 *
 * A flat 20% alpha over 136 bins turns the plant into haze. Weighting alpha by
 * the fresnel term instead makes the rim of each vessel firm and its face clear,
 * which is what lets you see 48 bins deep into the finished-feed store and still
 * count them. Injected here rather than at `color_fragment` because the normal
 * does not exist yet at that point in three's fragment shader.
 */
const FRAG_ALPHA = /* glsl */ `
// FAKIEH_SILO_SHELL_ALPHA
if ( uShellPass > 0.5 ) {
  // Fresnel: nearly clear where you look straight through it, firm at the rim.
  // That is what makes a row of vessels read as a row of vessels rather than
  // one flat wash, and it is what lets you see the contents inside.
  float rim = clamp( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 0.0, 1.0 );
  float clearAlpha = mix( 0.24, 0.94, pow( rim, 2.0 ) );

  /*
   * Put the tonal range INTO the vessel.
   *
   * Measured on the rendered frame rather than argued from the palette: the
   * image is not washed at all — it reaches true black and 93% white — but the
   * range is bimodal and lives entirely in the BACKGROUND. A dark ground at
   * 20-30% luminance under a light sky at 70-90%, and the silos sitting on the
   * seam between them holding almost none of it. The subject had no contrast of
   * its own, which is why it read as weak whatever the lighting did.
   *
   * A 24%-alpha surface cannot hold a dark value: three quarters of it is
   * whatever is behind it. So the glass goes SOLID exactly where it is unlit.
   * The shaded flank becomes a real dark mass in the silhouette, while the face
   * you are actually looking through stays clear — and with the sun 55 degrees
   * off-axis and BEHIND the camera, the near face is the lit one. The two
   * requirements do not fight: the geometry of the light already separated them.
   */
  float lit = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
  float shade = 1.0 - smoothstep( 0.06, 0.5, lit );
  diffuseColor.a = mix( clearAlpha, 0.95, shade * 0.5 ) * ( 1.0 - vFx.x * 0.4 );

  /*
   * A named material has to be findable, not just present.
   *
   * Ten of this plant's 131 bins carry a material code. The legend names all
   * ten, with a colour and a bin count against each — but almost every camera
   * angle looks at a bin's LIT flank (the sun sits behind the camera in every
   * look; see look.ts), and on the lit flank clearAlpha above bottoms out
   * at 0.24 across most of a cylinder's face, dead centre of its fresnel
   * curve. At 24% opacity three quarters of what reaches the eye is whatever
   * sits behind the glass, so even a fully-saturated vMat tint reads as a
   * whisper — which is the actual defect: 04-zone-raw.png shows one bin that
   * is trying to be orange and reads as grey with a faint warm cast.
   *
   * This is the fix, and it is a floor, not a replacement: max() never lowers
   * what the fresnel/shade logic above already computed, it only raises the
   * ten coded bins' minimum. Gated on vFx.z alone (see siloMesh.tsx —
   * exactly 0 for the 121 bins the plant has not named), so the 121 unnamed
   * vessels get precisely nothing here — no invented colour, no invented
   * opacity either. What changes is that a coded bin can no longer hide at
   * the weak end of its own fresnel curve the way every other bin still can.
   */
  diffuseColor.a = clamp( max( diffuseColor.a, mix( 0.0, 0.6, vFx.z ) ), 0.0, 0.97 );

  /*
   * ...and this has to be applied to outgoingLight, not to diffuseColor.
   *
   * opaque_fragment — the chunk this block replaces — writes
   * gl_FragColor = vec4( outgoingLight, diffuseColor.a ). By the time
   * execution reaches here, diffuseColor.rgb has already been folded into
   * outgoingLight and nothing reads it again. The rim sheen that used to live
   * on this line added to diffuseColor.rgb and was therefore DEAD: the one
   * highlight term in the shell pass, never rendering a single pixel, which is
   * a fair part of why the vessels looked like flat tinted plastic.
   */
  outgoingLight *= 1.0 - shade * 0.22;

  /*
   * A dark contour at the silhouette edge — not a highlight.
   *
   * The line above darkens the SHADED flank, but the sun sits 55 degrees
   * off-axis and behind the camera, so the face actually pointed at most
   * cameras most of the time is the LIT one, where shade is near zero. On that
   * face the only rim treatment used to be an ADDITIVE sky-coloured sheen,
   * growing with fresnel exactly where alpha is also growing toward opaque.
   * This plant's own sky is pale — close to white behind a bin at range, see
   * 01-site-day.png and the tops of the row in 04-zone-raw.png — so the one
   * pixel becoming solid enough to matter was being painted the same tone as
   * the thing it was supposed to separate from. A bright edge on a bright sky
   * is no edge at all, which is a real part of "barely able to see them".
   *
   * edgeDark darkens outgoingLight on the SAME fresnel term that already
   * drives alpha toward opaque, on both flanks, lit or shaded — so the pixel
   * that is turning solid is also turning into a firm dark value, which holds
   * as a contour against a pale sky, a dark yard floor, or the next bin 15 cm
   * away, none of which this shader can see and none of which it needs to: it
   * is reading its own curvature, not what happens to be behind it. It is
   * continuous in rim, not a screen-space line of constant width, so it
   * thickens on tight curvature and all but disappears on a flat-on face
   * rather than drawing a cartoon outline.
   *
   * The old sheen survives, at roughly a third of its former strength and a
   * tighter exponent (rim^5, not rim^3) — a thin glint right at the edge of
   * the lit flank, not a wash across the whole rim band.
   */
  /*
   * Both terms widened and deepened slightly from the values that first
   * introduced this contour (pow 3.0/0.42 and pow 5.0/0.35 respectively).
   * Measured, not guessed: the rendered frame's own histogram showed almost
   * nothing above the 60-70% luminance decile at zone zoom (see the report),
   * meaning the "sheen" term below was never actually reaching a value worth
   * calling bright, and the contour above it was too narrow a band to read
   * as a real dark edge rather than a thin line. Lowering the exponent
   * widens the band each term acts over; raising the coefficient deepens
   * what lands in it. Still rim-weighted, still nowhere near the whole face.
   */
  float edgeDark = pow( rim, 2.6 ) * 0.48;
  outgoingLight *= 1.0 - edgeDark;
  outgoingLight += vec3( 0.24, 0.25, 0.27 ) * pow( rim, 4.0 ) * ( 1.0 - shade ) * 0.55;
}
#include <opaque_fragment>
`;

/**
 * The places this patch splices into three's shader.
 *
 * Named here because `String.replace` fails SILENTLY. If three renames a chunk —
 * `output_fragment` became `opaque_fragment` in r152 — the replace matches
 * nothing, the injected code never runs, and the page still renders, just
 * wrongly. `scripts/verify-plant3d.mjs` asserts each marker appears exactly once
 * in the stock shader, which turns that silent failure into a loud one.
 */
/**
 * A stable name for the shell-alpha injection, emitted into the patched GLSL
 * as a comment so a check can confirm the block actually landed.
 *
 * The check used to look for a literal line of the injected code instead, and
 * broke the first time that line was edited — reporting "the shell alpha block
 * did not get injected at all" when it had. A sentinel is a contract; an
 * incidental string is a trap that fires on refactors and not on regressions.
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
) {
  const uniforms = {
    uY0: { value: y0 },
    uY1: { value: y1 },
    uEdge: { value: new THREE.Color(FILL_EDGE) },
    uAccent: { value: new THREE.Color(ACCENT) },
    uShellPass: { value: shellPass ? 1 : 0 },
    uSeamFrac: { value: seamFrac },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchSiloShader(shader);
  };
  /*
   * This override is load-bearing, not boilerplate.
   *
   * three's default cache key is `this.onBeforeCompile.toString()`. Both passes
   * are patched by this same function, so both get the identical arrow-function
   * source text — `shellPass` is closed over and invisible to `toString()` — and
   * the two would key the same. Today they also differ in `transparent` and
   * `side`, which feed the cache key separately and would probably save it; that
   * is luck, not design. Naming them explicitly is what actually keeps the
   * contents pass from being handed the shell pass's compiled program.
   */
  material.customProgramCacheKey = () => (shellPass ? 'fakieh-silo-shell-2' : 'fakieh-silo-solid-2');
  return material;
}

/**
 * Height, in the same real metres as `y0`/`y1`, of the hopper-to-barrel
 * seam. `hopper <= 0` (the flat-bottomed outdoor groups) has no such seam, so
 * it resolves to a fraction outside 0..1 that `siloRingAt` never lights up —
 * a sentinel rather than a special-cased branch in the shader.
 */
function seamFractionOf(y0: number, y1: number, hopper: number): number {
  if (!(hopper > 0)) return -1;
  return hopper / Math.max(y1 - y0, 1e-4);
}

/*
 * `hopper` defaults to 0 (no seam drawn — `seamFractionOf` sentinels out to
 * -1) rather than being required. `siloMesh.tsx` is a file this module does
 * not own, so the call sites there cannot be changed here; the default keeps
 * this compiling and rendering correctly against the CURRENT three-argument
 * call, and the hopper/barrel seam lights up the moment the reported change
 * below is applied there. See the report for the exact one-line diff.
 */
export function makeContentsMaterial(shell: string, y0: number, y1: number, hopper = 0) {
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
  );
}

export function makeShellMaterial(shell: string, y0: number, y1: number, hopper = 0) {
  return patchSilo(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(shell),
      roughness: 0.28,
      metalness: 0.1,
        transparent: true,
      /*
       * Depth writing OFF, so you can see through one bin to the bin behind it.
       *
       * That is the whole point of drawing them as glass, and writing depth
       * killed it — the plant went back to being a row of opaque cylinders. The
       * ordering problem it was covering up (three sorts transparent objects,
       * not instances, so a far shell could composite over a near one) is dealt
       * with properly instead: `useInstanceOrder` below sorts the instances
       * back-to-front as the camera moves.
       */
      depthWrite: false,
      /*
       * FrontSide, not DoubleSide.
       *
       * DoubleSide meant a ray through the middle of ONE bin crossed its front
       * wall and its back wall before reaching anything else. At the 0.46 alpha
       * floor below that is 1-(0.54)^2 = 0.71 opaque for a single vessel, and
       * the finished-feed store is three rows deep: six crossings, 0.975, which
       * is not glass, it is a grey wall. The bank photographs as a solid mass
       * and no amount of lighting fixes it, because it is the alpha maths.
       *
       * Halving the crossings costs nothing — it removes fragment work — and
       * the lathe winds outward, so the same geometry already renders correctly
       * FrontSide on the opaque contents pass.
       */
      side: THREE.FrontSide,
    }),
    y0,
    y1,
    true,
    seamFractionOf(y0, y1, hopper),
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
