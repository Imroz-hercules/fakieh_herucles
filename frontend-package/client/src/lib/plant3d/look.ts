/**
 * Fakieh plant 3D — lighting and atmosphere data.
 *
 * Pure data and pure functions only. No JSX and no `three` import: the module
 * that consumes this (`Plant3D.tsx`) owns every component; this file owns the
 * numbers those components read. That split is what lets the numbers be tuned
 * — and reasoned about — without touching, or risking, any rendering code.
 *
 * ---------------------------------------------------------------------------
 * The art direction, in one line: the WORLD is desaturated so the DATA reads.
 * ---------------------------------------------------------------------------
 * An operator has to tell a bin's material from its hue and its fill from the
 * solid part of the cylinder, at a glance. Every colour in this file for the
 * sky, the ground and the light is therefore kept low-chroma and cool-to-
 * neutral, on purpose, so a green maize silo or a blue soya silo is the only
 * saturated thing on screen. The one deliberate exception is the low dusk sun
 * and the sodium-vapour mast lights: those carry warmth because that IS the
 * physically correct colour of that light source, not because the environment
 * is meant to compete with the silos.
 *
 * ---------------------------------------------------------------------------
 * REBUILT for Phase 2 workstream D (visual overhaul plan §3, §4.D, §6a).
 * ---------------------------------------------------------------------------
 * DESIGN.md's "Scene palette (day look)" table is the source of truth for the
 * day look's numbers; dusk and night are rebuilt to the same structure with
 * their own mood. `drei Sky` is gone — replaced by `SkyDome.tsx`, a hand-
 * authored three-stop gradient dome, so the sky tone is art-directed and
 * identical across every screenshot rather than a function of scattering
 * parameters nobody can reliably reproduce. `skyHorizon`/`skyMid`/`skyZenith`
 * are the three stops that dome reads; `skyColor` (the older single-tone
 * field several other things — the hemisphere light's sky term, the rim
 * lightformers — already read) is kept and set equal to `skyMid` per look, so
 * nothing that reads it needs to change and the interface stays additive.
 *
 * `skyTurbidity`/`skyRayleigh`/`skySunPosition` are no longer read by
 * `Plant3D.tsx` (nothing in this rebuild uses `drei Sky` any more) but are
 * left in the `Look` interface and the data below, unset-but-present is not
 * an option for a `Record<TimeOfDay, Look>` — every look must supply every
 * field — so they keep their historical values rather than being deleted:
 * "additive, don't remove a field other code reads" is the safer rule to
 * follow even for a field that, after this rebuild, nothing reads yet.
 *
 * ---------------------------------------------------------------------------
 * Fog geometry — measured, not guessed.
 * ---------------------------------------------------------------------------
 * The complaint this fixes: at dusk and night, large parts of the 340 x 190 m
 * site sat inside the fog ramp and washed toward the fog colour, because the
 * whole-site camera is much closer to the plant than the 340 m ground plane
 * suggests.
 *
 * Measured by replicating `fitToBounds` from `Plant3D.tsx` outside React,
 * against the REAL data (`SITE_BOUNDS` from `silos.ts`, `SITE_VIEW.dir` from
 * `site.ts`, FOV 42, the HUD's own top/bottom insets) across the aspect ratios
 * this canvas can plausibly render at (the app's own documented floor is a
 * 965 px-wide "compact" layout; realistic embedded-canvas aspects for that
 * width run from roughly 1.4 up to a 4K ultrawide):
 *
 *   aspect 1.4  -> camera ~299 m from target, farthest plant corner ~395 m
 *   aspect 1.8  -> camera ~250 m from target, farthest plant corner ~349 m
 *   aspect 2.13 -> camera ~223 m from target, farthest plant corner ~324 m
 *   aspect 2.87 -> camera ~200 m from target, farthest plant corner ~302 m
 *
 * (Only below aspect ~1.4 — a near-square window, not a realistic shape for
 * this dashboard's canvas — does the farthest corner pass 400 m.)
 *
 * So a fog-near floor of ~400 m clears the plant at every realistic aspect.
 * `FOG_NEAR` is set to 450 — DESIGN.md's own day figure ("Fog ... from 450 m")
 * and still comfortably above that 400 m floor — and, as before, is the SAME
 * number in all three looks: a single derived constant is easier to trust
 * than three hand-tuned ones that happen to agree. Only `fogFar` (how quickly
 * the ground beyond the compound gives way to the horizon) changes per look,
 * because that is mood, not geometry.
 *
 * For reference, the ground plane's own far corners (SITE.ground, 340 x 190,
 * centred on the world origin — NOT centred on the plant) sit at roughly
 * 315-390 m for typical aspects, so `fogFar` in every look below is chosen to
 * sit near or beyond that, which is what makes the ground "fall away" rather
 * than hit a visible wall of fog.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface Look {
  /** strength of the yard lighting, 0 = daylight and the masts stay dark */
  mast: number;
  /** colour of the mast lamp heads and their point lights */
  mastColor: string;
  /** overall strength of the generated environment map */
  envIntensity: number;
  /**
   * Legacy `drei Sky` scattering params. Nothing in this rebuild reads them
   * (`SkyDome.tsx` replaces `Sky` outright — see the file header) but they
   * stay in the interface and the data: additive only, never remove a field.
   */
  skyTurbidity: number;
  skyRayleigh: number;
  /** brightness of the sky, sun, ground bounce and back rim within it */
  envSky: number;
  envSun: number;
  envGround: number;
  envRim: number;
  sunPosition: [number, number, number];
  /**
   * Where the SKY DOME thinks the sun is, when that has to differ from where
   * the key light is. Legacy from the `drei Sky` era (see the note on
   * `skyTurbidity` above) — `SkyDome.tsx` does not read it, but night's own
   * geometry note below is kept for the record: the moon sits ABOVE the
   * horizon for the directional light while this vector, mirrored below it,
   * used to drive `Sky`'s zero-intensity night floor.
   */
  skySunPosition?: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  /** legacy single-tone sky colour — kept equal to `skyMid` below; read by
   *  the hemisphere light's sky term and the rim lightformers. */
  skyColor: string;
  /** the three `SkyDome` gradient stops (DESIGN.md "Scene palette") */
  skyHorizon: string;
  skyMid: string;
  skyZenith: string;
  groundColor: string;
  ambient: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  ground: string;
  yard: string;
  road: string;
  /** `gl.toneMappingExposure` for this look — the ToneMapping EFFECT has no
   *  exposure prop in postprocessing 2.19/6.39 (Codex audit finding), so
   *  exposure lives on the renderer and is applied per look in an effect. */
  exposure: number;
}

/* ------------------------------------------------------------------ */
/* Sun/moon placement rule — codified, not just remembered.            */
/* ------------------------------------------------------------------ */

/**
 * Angle, in degrees, between a candidate `sunPosition` and `SITE_VIEW.dir` —
 * the direction the whole-site camera sits in, relative to what it looks at
 * (see `site.ts`). `SITE_VIEW.dir` is not imported here on purpose: this
 * module has no dependency on the site geometry, so it stays trivial to unit
 * test or reuse, and the one call site below passes the vector in explicitly.
 *
 * The hard-won rule this checks: frontal light (sun near the camera's own
 * direction, angle near 0 deg) lights every visible face evenly and kills
 * every shadow — the site reads as flat cardboard. Direct backlight (sun
 * near 180 deg — i.e. roughly opposite the camera, which puts it in front of
 * the camera, in view) silhouettes the bins AND drags the sun disc into the
 * frame, where a naive sky dome would blow the whole upper half of the image
 * to white. The safe zone is well off to one side, roughly 45-80 degrees, AND
 * on the same side as the camera (a positive dot product / angle under 90) so
 * the light stays behind or beside the camera rather than in front of it.
 */
export function angleToCameraDir(
  position: readonly [number, number, number],
  cameraDir: readonly [number, number, number],
): number {
  const dot3 = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const mag = (v: readonly [number, number, number]) => Math.sqrt(dot3(v, v));
  const denom = mag(position) * mag(cameraDir);
  if (denom === 0) return 0;
  const cosTheta = Math.min(1, Math.max(-1, dot3(position, cameraDir) / denom));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/**
 * Verifies every look's sun/moon position against the rule above and warns,
 * loudly, if one has drifted into the unsafe zone. This file must not import
 * scene geometry, so the caller supplies `cameraDir` — the actual call lives
 * in `scripts/verify-plant3d.mjs` ("the sun is off-axis and behind the
 * camera in every look"), which passes `SITE_VIEW.dir` from `site.ts` AND
 * every zone's own `dir` (see that check's own comment for why one direction
 * was never enough).
 */
export function checkSunGeometry(
  looks: Record<TimeOfDay, Look>,
  cameraDir: readonly [number, number, number],
): { time: TimeOfDay; angleDeg: number; safe: boolean }[] {
  return (Object.keys(looks) as TimeOfDay[]).map((time) => {
    const angleDeg = angleToCameraDir(looks[time].sunPosition, cameraDir);
    /* Matches the "roughly 45-80 degrees" safe zone documented on
       `angleToCameraDir` above. */
    return { time, angleDeg, safe: angleDeg >= 45 && angleDeg <= 80 };
  });
}

/* ------------------------------------------------------------------ */
/* Looks                                                               */
/* ------------------------------------------------------------------ */

/** Every look shares this fog-near distance — see the file header for why. */
const FOG_NEAR = 450;

export const LOOKS: Record<TimeOfDay, Look> = {
  day: {
    mast: 0,
    mastColor: '#ffdca8',
    /* Legacy `Sky` params — unread, see the interface note above. */
    skyTurbidity: 2.5,
    skyRayleigh: 2.4,
    /*
     * MEASURED AND CORRECTED (2026-09-02) — the day look, as first rebuilt,
     * read as badly over-bright on the client's own laptop ("it's too
     * bright"): a near-white sky with no visible gradient, mean full-frame
     * luminance 0.837 against this look's real target of roughly 0.42-0.48.
     * The headline cause was SIX lightformers now feeding the environment
     * map instead of the old four (plan §4.D.3 asks for six — sky dome, sun
     * disc, ground bounce, two rim fills, one large soft overhead) at
     * roughly the SAME per-former intensities the old four used — strictly
     * more energy into the same PBR materials — compounded by DESIGN.md's
     * much paler day ground trio (`#b9b5ad`/`#a8a49b`/`#4a4d52` reflects far
     * more of whatever light lands on it than the old, much darker
     * placeholder trio did): more incoming light AND more reflected light at
     * once. `envIntensity` 0.34 -> 0.15, in several measured passes (0.20
     * alone was not enough — see `exposure` below for the full sequence and
     * the final whole-site/zone numbers), is the single biggest lever; the
     * two new formers are also individually turned down at the source (see
     * `lightformersFor` below) rather than only compensated here, so adding
     * a seventh former later does not silently repeat this.
     */
    envIntensity: 0.4, /* 0.15 -> 0.4, same live judgement: steel needs the sky to reflect */
    envSky: 0.55,
    envSun: 5.5,
    envGround: 0.16,
    envRim: 0.22,
    /*
     * REPOSITIONED for the rebuild (2026-09-02).
     *
     * The previous position, [-130, 88, 200] (elevation 20.2 deg), measured
     * 51.9 degrees off `SITE_VIEW.dir` — comfortably in the composed 45-80
     * band — but only 40.1-42.4 degrees off three of the five ZONE camera
     * directions (dosing, buffer, finished — all three point in nearly the
     * same direction, close to +Z with a small +X lean), which is what
     * `verify-plant3d.mjs`'s "the sun is off-axis and behind the camera"
     * check reports as an advisory. DESIGN.md also wants day's sun at
     * "elevation ~50 deg", which the old position (20.2 deg) did not meet at
     * all.
     *
     * [-175, 255, 130] fixes both at once: elevation 49.5 deg, and verified
     * with `angleToCameraDir` against every one of the six camera directions
     * `verify-plant3d.mjs` checks —
     *   whole site   66.0 deg
     *   outside yard 74.8 deg
     *   raw material 57.1 deg
     *   dosing       53.6 deg
     *   press buffer 55.3 deg
     *   finished     52.8 deg
     * — every one inside the 45-80 band, so this look now produces ZERO
     * advisories, not just zero failures. `npm run verify:plant3d` confirms
     * this at build time.
     */
    sunPosition: [-175, 255, 130],
    /* Trimmed 3.2 -> 2.1 alongside the environment/ambient cuts above —
       still the dominant light (real directional contrast, a shadow that
       reads meaningfully darker than the lit apron), just no longer
       stacking with an equally-strong ambient/env budget to blow the
       highlights out. */
    sunIntensity: 2.1,
    /* DESIGN.md "Scene palette (day look)": sun `#fff6e8`. */
    sunColor: '#fff6e8',
    /* DESIGN.md sky stops: horizon `#dfe8f0`, mid `#8fb8dd`, zenith `#3d7cc0` —
       read by `SkyDome.tsx`. `skyColor` (legacy, still read by the hemisphere
       light and the rim lightformers below) is kept equal to the mid stop. */
    /* Judged on the laptop 2026-09-02: the site camera looks DOWN ~20 deg,
       so the top of the frame is ~1 deg above the horizon and the only sky a
       viewer ever sees is the horizon stop. A near-white horizon (#dfe8f0)
       meant no blue at all on screen; the stops start light blue now and
       the dome's HORIZON_BAND is small so the mid blue arrives within a few
       degrees. */
    skyHorizon: '#b3cce4',
    skyMid: '#74a7d8',
    skyZenith: '#3d7cc0',
    skyColor: '#8fb8dd',
    /* Bounce tint for the environment's ground lightformer and the
       hemisphere light's "ground" colour — cool neutral grey, so nothing
       under a hopper picks up a cast that competes with the silo's own
       material colour. */
    groundColor: '#5a5f66',
    /* 0.15 -> 0.075, in several measured passes, alongside the env/sun cuts
       above — same over-bright finding: hemisphere ambient was filling in
       evenly across the whole frame on top of an already-strong environment
       map and sun, which is exactly what erases the sun-cast shadow
       contrast a "clean daylight scale model" (DESIGN.md) needs. Raising it
       further (tried 0.095) to lift a stubborn dark decile in the Raw
       Material zone view moved that decile share by well under a point —
       that spike (structure-steel legs/rings at a fixed dark albedo
       dominating one luminance band) is not primarily an AMBIENT-level
       problem; see the picture-check table in the delivery report. */
    /* 0.075 -> 0.5 (2026-09-02, judged live on the laptop): at 0.075 every
       unlit face was black. The hemisphere fill is ambient x 0.7 in the scene,
       so this is a 0.35 hemisphere: shadow sides read blue-grey, the sun
       still dominates. */
    ambient: 0.5,
    /* DESIGN.md: fog `#dfe8f0` from 450 m. */
    fog: '#cfdce9',
    fogNear: FOG_NEAR,
    fogFar: 1400,
    /* DESIGN.md "Scene palette (day look)": apron/yard/road (ground/yard/road
       here) `#b9b5ad` / `#a8a49b` / `#4a4d52`. Bare terrain beyond the
       compound is derived from `ground` by `ground.tsx`'s own shader (a
       fixed warm tint plus noise) — DESIGN.md's separately-listed terrain
       tone `#c9bfae` is what that derivation produces, not a value this file
       sets directly; `ground.tsx` is not owned by this workstream. */
    ground: '#b9b5ad',
    yard: '#a8a49b',
    road: '#4a4d52',
    /*
     * MEASURED, in several passes: 1.0 -> 0.88 -> 0.78 -> 0.56 -> 0.42,
     * settling at 0.44 once `envIntensity`/`ambient`/`sunIntensity` above
     * were brought back up slightly from their first (too-aggressive) cut to
     * stop starving the Raw Material zone view's own mid-tone floor. ACES'
     * soft highlight shoulder means an over-bright INPUT does not clip hard
     * to flat white, it desaturates and flattens toward it gradually, which
     * is exactly the "over-bright and low-contrast... weak shading" the
     * client described — the shoulder was doing real work across most of
     * the frame instead of only the true highlights (the sun disc, a direct
     * glint) it exists for. Also fixed alongside this: `SkyDome.tsx`'s own
     * `SKY_LINEAR_GAIN` (the sky dome's flat vertex colours were being
     * pushed through this same composer tonemap+LUT chain despite
     * `toneMapped: false`, which only exempts an object from the
     * RENDERER'S per-object tonemapping chunk — moot once an
     * `EffectComposer` owns tonemapping — not from the composer's own
     * full-frame `ToneMapping`/`LUT` effects, which have no per-object
     * awareness at all).
     *
     * `npm run verify:picture` (whole site + Raw Material, day only)
     * confirms the result: whole-site mean 34% (mid-tone 87%/90.2% at the
     * two windows the check measures), Raw Material mean 23% (mid-tone
     * 32%/57.1%, tonal spread 25% >= the 22% floor) — both clear their
     * mid-tone floors and Raw Material's tonal-range floor. Two things
     * remain open and are NOT lighting-fixable — see the delivery report:
     * Raw Material's decile[2] (0.2-0.3 luminance) still holds ~39% of that
     * view's pixels (a fixed-albedo structure-steel colour dominating one
     * band, unmoved by an ambient sweep up to 0.095), and material
     * separability there is far under its floor (rendered materials read
     * 13% as separated as their target swatches — a `siloShader.ts`
     * fill-colour matter, not a lighting one).
     *
     * Verified the composer's `ToneMapping` effect actually reads
     * `gl.toneMappingExposure` at all (plan §6a's audit flagged this as
     * unverified, with "drive the LUT's brightness instead" as the fallback
     * if it did not): swept exposure 0.3/0.5/1.5/2.0 against the live
     * render and read back whole-frame mean luminance each time —
     * 0.3 -> 0.509, 0.5 -> 0.640, 1.5 -> 0.855, 2.0 -> 0.890. Strictly
     * monotonic and a large swing per step, so it does; the exposure knob
     * is real and this is not a case that needs the LUT-brightness fallback.
     */
    /* 0.44 -> 0.8 (2026-09-02, judged on the client's laptop, not headless):
       at 0.44 the day frame was overcast grey — flat sky, charcoal steel,
       black shadows. 0.8 puts the apron near its design tone and the steel
       pale; 1.05 washes the apron. The sky dome pre-compensates for this
       value exactly (see SkyDome.tsx), so changing it no longer whitens the sky. */
    exposure: 0.8,
  },
  dusk: {
    /* DESIGN.md: "masts 40%" at dusk. */
    mast: 0.4,
    /* Warm-white rather than the day's cooler mast colour: at dusk the masts
       are only just catching, so they read closer to the sun's own warmth. */
    mastColor: '#ffb877',
    skyTurbidity: 8,
    skyRayleigh: 2.2,
    envIntensity: 0.3,
    envSky: 0.34,
    envSun: 6.5,
    envGround: 0.14,
    envRim: 0.24,
    /*
     * UNCHANGED from the previous tuning. Verified again with
     * `angleToCameraDir` against every one of the six camera directions:
     *   whole site 60.3, outside yard 79.4, raw material 55.6,
     *   dosing 49.5, press buffer 51.9, finished 49.8
     * — every one inside the 45-80 band already; this look produced zero
     * advisories before this rebuild and still does. Elevation 10.3 deg,
     * close enough to DESIGN.md's "~12 deg" that re-deriving it was not
     * worth the risk of breaking a position already proven clean on all six.
     */
    sunPosition: [-140, 40, 170],
    sunIntensity: 2.2,
    /* DESIGN.md: dusk sun colour `#ffc38a`. */
    sunColor: '#ffc38a',
    /* Warm at the horizon, blue above — DESIGN.md: "a clean low warm sun on
       neutral steel with a blue-to-warm gradient sky, not a sunset filter."
       Mid-tones are the thing DESIGN.md holds to within 5 points of day, so
       these stops stay close in LUMINANCE to day's (only warmer in hue at
       the horizon and cooler/darker toward the zenith), rather than reading
       as a uniformly darker filter over the same sky. */
    skyHorizon: '#f2b98c',
    skyMid: '#8d90a6',
    skyZenith: '#3c4568',
    skyColor: '#8d90a6',
    groundColor: '#5a5152',
    /* Raised from the pre-rebuild 0.16: that value was tuned against the old,
       much darker ground/yard/road trio. Against the lightened trio below it
       held mid-tones far under the day-minus-5 floor DESIGN.md sets — see
       the picture-check table in the delivery report. */
    ambient: 0.24,
    /* Cooler and less brown than a plain dusk-orange fog would read — this
       stays a blue-grey dusk atmosphere rather than sliding toward the muddy
       brown the brief explicitly rejects ("not an orange wash"). */
    fog: '#5c6584',
    fogNear: FOG_NEAR,
    fogFar: 850,
    /*
     * Lightened from the pre-rebuild trio (`#3f434a`/`#666b71`/`#15171a`),
     * which was tuned to sit well below day's OLD, much darker apron. Day's
     * apron is now DESIGN.md's pale `#b9b5ad`, and holding dusk at the old
     * dark trio put it far below the "day minus 5 points" mid-tone floor —
     * measured, not guessed (see the picture-check table). Still a lower key
     * than day, on purpose — dusk is meant to read as a dimmer version of the
     * same site, not a colour filter over an identical ground.
     */
    ground: '#8f887c',
    yard: '#847c70',
    road: '#2c2e33',
    /* Slightly lower than day's 1.0, per DESIGN.md/plan §3.3. */
    exposure: 0.94,
  },
  night: {
    mast: 1,
    /* Saturated sodium-vapour amber: the ONE warm, saturated thing allowed
       in this look, deliberately, because it is what "pooled mast light
       against a dark plant" actually looks like. */
    mastColor: '#ffb35c',
    skyTurbidity: 8,
    skyRayleigh: 0.3,
    envIntensity: 0.1,
    envSky: 0.12,
    envSun: 0.4,
    envGround: 0.05,
    envRim: 0.08,
    /*
     * NUDGED from the pre-rebuild [-150, 70, 130] (elevation 19.4 deg).
     *
     * That position kept the whole-site direction safely inside the 45-80
     * band (66.8 deg) but put "Outside Yard" — the widest swing of the five
     * zone directions — at 83.9 deg, just past the composed band; harmless
     * under the OLD rule (only whole-site was ever REQUIRED to be inside
     * 45-80, everything else was advisory-only) but this rebuild's own
     * acceptance bar is stricter: EVERY look, EVERY direction, zero
     * advisories, not only the day look the brief called out by name.
     *
     * [-130, 65, 165] (elevation 17.2 deg, close enough to the old 19.4 that
     * the "moon" character is unchanged) fixes it — verified with
     * `angleToCameraDir` against all six directions:
     *   whole site 57.3, outside yard 75.5, raw material 51.7,
     *   dosing 45.7, press buffer 48.1, finished 45.9
     * — every one inside 45-80. `npm run verify:plant3d` confirms zero
     * advisories for every look at build time.
     */
    sunPosition: [-130, 65, 165],
    /* Same vector, mirrored below the horizon — legacy `Sky` field, unread
       by `SkyDome.tsx` (see the interface note); kept for the record. */
    skySunPosition: [-130, -65, 165],
    sunIntensity: 0.18,
    sunColor: '#a8c4ff',
    skyHorizon: '#1c2436',
    skyMid: '#131b2c',
    skyZenith: '#05070c',
    skyColor: '#131b2c',
    groundColor: '#0a0c10',
    /* Cut hard — the hemisphere fill was flattening every shadow the
       (correctly positioned, dim) moon and the masts throw. This is what
       actually makes the masts read as pools of light instead of one more
       even wash. */
    ambient: 0.07,
    /* Near-black — a real dark anchor for the look that most needs one. */
    fog: '#05070c',
    fogNear: FOG_NEAR,
    /* Shortest fogFar of the three: night visibility falling off within a
       couple of hundred metres past the compound reads as correct, where it
       would read as an odd bright plateau at day's 1400 m setting. Still
       comfortably beyond the ~400 m the plant itself needs to stay clear. */
    fogFar: 620,
    ground: '#101216',
    yard: '#151714',
    road: '#08090b',
    /* Raised so the plant is legible rather than a black plane with amber
       dots on it — DESIGN.md/plan §3.3 ("exposure 1.1 so the plant is
       legible, not black"). */
    exposure: 1.15,
  },
};

/* ------------------------------------------------------------------ */
/* Environment lightformers                                            */
/* ------------------------------------------------------------------ */

/**
 * One drei `<Lightformer>`'s worth of plain data. `rotation` is a full Euler
 * triple rather than the `rotation-x` shorthand JSX prop the inline version
 * used — same result (`mesh.rotation` takes an [x, y, z] triple either way),
 * but a triple is representable as data without resorting to a dashed object
 * key.
 */
export interface LightformerSpec {
  /** stable React key */
  key: string;
  form: 'rect' | 'circle' | 'ring' | 'box';
  color: string;
  intensity: number;
  scale: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  target?: [number, number, number];
}

/**
 * The SIX lightformers that make up the generated environment map, for one
 * look (plan §4.D.3 / §3.1: "six formers (sky dome, sun disc, ground bounce,
 * two rim fills, one large soft overhead)"). Baked once per look at 256px
 * (`SiteEnvironment` in `Plant3D.tsx`).
 */
export function lightformersFor(look: Look): LightformerSpec[] {
  return [
    /* sky dome — the main reflection source for every curved metal surface */
    {
      key: 'sky-dome',
      form: 'rect',
      intensity: look.envSky,
      color: look.skyMid,
      scale: [60, 60, 1],
      position: [0, 26, 0],
      rotation: [Math.PI / 2, 0, 0],
    },
    /* the sun itself, where the directional light is */
    {
      key: 'sun-disc',
      form: 'circle',
      intensity: look.envSun,
      color: look.sunColor,
      scale: [14, 14, 1],
      position: [look.sunPosition[0] * 0.12, look.sunPosition[1] * 0.12, look.sunPosition[2] * 0.12],
      target: [0, 0, 0],
    },
    /* ground bounce, which is what fills the underside of a hopper */
    {
      key: 'ground-bounce',
      form: 'rect',
      intensity: look.envGround,
      color: look.groundColor,
      scale: [60, 60, 1],
      position: [0, -18, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
    /* rim fill 1: a cool rim from the side opposite the sun, so the shaded
       side of a bin is not dead black */
    {
      key: 'rim-fill-1',
      form: 'rect',
      intensity: look.envRim,
      color: look.skyMid,
      scale: [40, 20, 1],
      position: [-look.sunPosition[0] * 0.1, 8, -look.sunPosition[2] * 0.1],
      target: [0, 0, 0],
    },
    /*
     * rim fill 2: the second flank, rotated 90 degrees from rim 1 around Y —
     * without it, a bin lit from the sun's side and rimmed only opposite it
     * still goes dead on the two flanks perpendicular to both.
     *
     * 0.75 -> 0.4: measured over-bright (delivery report, 2026-09-02) — six
     * formers at roughly the old four's per-former strength was strictly
     * more environment energy than the day look was tuned for. This and
     * `overhead-soft` below are the two NEW formers this rebuild added, so
     * they are the two turned down at the source rather than only
     * compensated for globally via `envIntensity`.
     */
    {
      key: 'rim-fill-2',
      form: 'rect',
      intensity: look.envRim * 0.4,
      color: look.skyHorizon,
      scale: [40, 20, 1],
      position: [look.sunPosition[2] * 0.1, 8, -look.sunPosition[0] * 0.1],
      target: [0, 0, 0],
    },
    /* one large, soft overhead source — a big, dim rect well above the sky
       dome former, standing in for a broad overcast-style skylight fill so
       the very top of a tall silo is not lit only by the two thin rims.
       0.45 -> 0.22, same measured over-bright finding as rim fill 2 above. */
    {
      key: 'overhead-soft',
      form: 'rect',
      intensity: look.envSky * 0.22,
      color: look.skyZenith,
      scale: [90, 90, 1],
      position: [0, 50, 0],
      rotation: [Math.PI / 2, 0, 0],
    },
  ];
}
