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
 * So: FOG_NEAR = 400 clears the plant, by construction, at every aspect ratio
 * this app can realistically render. It is the SAME number in all three
 * looks, deliberately — a single derived constant is easier to trust than
 * three hand-tuned ones that happen to agree. Only `fogFar` (how quickly the
 * ground beyond the compound gives way to the horizon) changes per look,
 * because that is mood, not geometry: day should stay legible a long way out,
 * night should go dark within a couple of hundred metres of the plant.
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
  /** drei Sky scattering — low turbidity and high rayleigh give a deeper blue */
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
   * the key light is.
   *
   * three's `Sky` is a separate unlit shader with no exposure control at all:
   * its brightness is a pure function of sun ELEVATION, through
   * `sunIntensity()`, and nothing about ambient, environment intensity or the
   * directional light reaches it. Night's sun sat 19.4 degrees ABOVE the
   * horizon, so the dome rendered an ordinary hazy daytime sky on top of a
   * correctly black ground — which is what made night look wrong even after
   * the light itself was fixed.
   *
   * Putting the sky's sun below the horizon drives `sunIntensity` to exactly
   * zero and leaves only the shader's residual night floor. The MOONLIGHT has
   * to keep coming from above, or the plant is lit from underneath — hence two
   * vectors rather than one. Only night needs this; day and dusk leave it unset
   * and the key light doubles as the sky's sun.
   */
  skySunPosition?: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  skyColor: string;
  groundColor: string;
  ambient: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  ground: string;
  yard: string;
  road: string;
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
 * frame, where drei's `Sky` shader blows the whole upper half of the image to
 * white. The safe zone is well off to one side, roughly 45-80 degrees, AND on
 * the same side as the camera (a positive dot product / angle under 90) so
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
 * camera in every look"), which passes `SITE_VIEW.dir` from `site.ts`.
 *
 * This exists because the check caught a real bug while this file was being
 * written: the night look's original moon sat at [-90, 40, -60], which is
 * 128 degrees off `SITE_VIEW.dir` — solidly in the unsafe "dragged into
 * frame" zone the day-look comment warns about, and the likely reason the
 * night look never read as dark: `Sky`'s scattering shader was very probably
 * drawing a glow at that position, in view, at `skyTurbidity: 12`. Night's
 * `sunPosition` below was moved to fix that; this function is what proved it
 * needed fixing and is left in so the same mistake cannot happen silently
 * again.
 */
export function checkSunGeometry(
  looks: Record<TimeOfDay, Look>,
  cameraDir: readonly [number, number, number],
): { time: TimeOfDay; angleDeg: number; safe: boolean }[] {
  return (Object.keys(looks) as TimeOfDay[]).map((time) => {
    const angleDeg = angleToCameraDir(looks[time].sunPosition, cameraDir);
    /* Matches the "roughly 45-80 degrees" safe zone documented on
       `angleToCameraDir` above — this used to accept 30-90, a materially
       wider band than the rule it claims to enforce, which meant the check
       could not fail even when a look drifted into the "frontal" (near 0-30)
       or "silhouette, sky blown out" (near 90+) failure zones that comment
       warns about. Tightened to match; see the file's delivery notes for the
       before/after proof (moved a look to 32 deg, watched this check fail,
       restored it). */
    return { time, angleDeg, safe: angleDeg >= 45 && angleDeg <= 80 };
  });
}

/* ------------------------------------------------------------------ */
/* Looks                                                               */
/* ------------------------------------------------------------------ */

/** Every look shares this fog-near distance — see the file header for why. */
const FOG_NEAR = 400;

export const LOOKS: Record<TimeOfDay, Look> = {
  day: {
    mast: 0,
    mastColor: '#ffdca8',
    /* Slightly clearer than before (was 3 / 2.6): a crisper, less hazy blue
       reads more like a clean technical daylight and less like a sunset. */
    skyTurbidity: 2.5,
    skyRayleigh: 2.4,
    envIntensity: 0.32,
    envSky: 0.55,
    envSun: 5.5,
    envGround: 0.16,
    envRim: 0.22,
    /*
     * UNCHANGED from the previous tuning, deliberately.
     *
     * Verified with `angleToCameraDir`: this position is 51.9 degrees off
     * `SITE_VIEW.dir` = [0.36, 0.34, 0.87], with a positive dot product
     * (0.617) — same side as the camera, comfortably inside the 45-80 degree
     * safe zone documented above. That is exactly the geometry this look's
     * own history says was hard-won (frontal light first, then silhouette-
     * plus-blown-sky, then this), so it is kept rather than re-derived.
     */
    sunPosition: [-130, 88, 200],
    sunIntensity: 3.2,
    /* Nearly neutral rather than cream: the old '#fff0d4' had enough warmth
       to tint every lit face and fight the "cool, clean daylight" target. */
    sunColor: '#fff4e2',
    skyColor: '#8ec2ec',
    /* Bounce tint for the environment's ground lightformer and the
       hemisphere light's "ground" colour — cool neutral grey, not the old
       warm brown ('#4a4438'), so nothing under a hopper picks up a brown
       cast that competes with the silo's own material colour. */
    groundColor: '#5a5f66',
    ambient: 0.13,
    fog: '#aec7dc',
    fogNear: FOG_NEAR,
    fogFar: 1100,
    /* Concrete grey, not sand-brown: the old '#5c5445' / '#6a6253' pair read
       as desert tan and pulled the whole frame warm before a single silo
       colour was drawn.
       Widened from '#6d7278'/'#797d82' — those two were only ~11/255 apart
       in luminance, close enough that the poured apron and the truck yard
       next to it read as one grey slab. The apron is darkened (concrete,
       drawn cool per the direction above) and the yard lightened (dustier,
       more sun-bleached), which is also what ground.tsx's own macro-noise
       and camera-distance depth cueing (see that file) needed: something to
       actually separate before either could show up as visible structure. */
    ground: '#5f6368',
    yard: '#8a8d90',
    /* The dark anchor the brief asked for. Every previous day value topped
       out at a middling '#33353a' — nothing in the frame was actually dark.
       Real asphalt reads near-black; this gives the pale concrete and the
       bright sky something to stand against even in the brightest look. */
    road: '#1e2024',
  },
  dusk: {
    mast: 0.55,
    /* Warm-white rather than the day's cooler mast colour: at dusk the masts
       are only just catching, so they read closer to the sun's own warmth. */
    mastColor: '#ffb877',
    /* Turbidity and rayleigh both pulled down from the old 10 / 3: that
       combination was what made dusk read as a saturated orange wash rather
       than a cooler, lower-key version of the same site. Some warmth stays
       in the sun itself (see sunColor) — that is the physically correct part
       of "dusk" — but the broad sky no longer fights it. */
    skyTurbidity: 8,
    skyRayleigh: 2.2,
    envIntensity: 0.3,
    envSky: 0.34,
    envSun: 6.5,
    envGround: 0.14,
    envRim: 0.24,
    /*
     * CHANGED. The previous [-190, 34, 150] only ever got checked against
     * `SITE_VIEW.dir` (72.5 degrees off it, fine) — but `ZONES` in `site.ts`
     * points the camera in five OTHER directions, one per working zone, and
     * `scripts/verify-plant3d.mjs` now checks all six. Against Outside
     * Yard's direction ([0.62, 0.44, 0.65], the widest swing of the five
     * because that zone's camera turns much further toward +X than the
     * others) the old position measured 91.3 degrees — just past the sun
     * staying behind the camera. Past 90 the sun is in front of it, so the
     * face turned toward the viewer is the unlit one: the exact "flattens
     * into cardboard" failure this file's own geometry rule exists to catch,
     * and on Outside Yard specifically it also fights `siloShader`'s shade-
     * driven solidify, which assumes the near face is the lit one.
     *
     * Pulled the sun in on X and lifted it slightly (Y 34 -> 40, Z 150 ->
     * 170) rather than redesigning the look: elevation only moves from 8.0
     * to 10.3 degrees, so the low, raking, long-shadow character this look
     * was tuned for is intact. Verified with `angleToCameraDir` against
     * every direction `verify-plant3d.mjs` now checks:
     *   whole site 60.3 deg (was 72.5) — inside the required 45-80 band
     *   Outside Yard 79.4 deg (was 91.3) — behind the camera, under the
     *     80-degree margin asked for
     *   Raw Material 55.6, Minerals & Micro 49.5, Press Buffer 51.9,
     *     Finished Feed 49.8 — all comfortably behind the camera
     * `npm run verify:plant3d` confirms all of the above at build time.
     */
    sunPosition: [-140, 40, 170],
    sunIntensity: 2.2,
    /* Slightly less saturated than the old '#ffb271' — still a clearly warm
       low sun, the one deliberately saturated light source in this look. */
    sunColor: '#ffb87a',
    skyColor: '#5f7396',
    groundColor: '#33383f',
    /* Cut from 0.26 to 0.16. The old ambient was bright enough to refill the
       shadows the low sun had just thrown, which is most of why dusk read as
       "washed" instead of moody. */
    ambient: 0.16,
    /* Cooler and less brown than the old '#42506b' -> this stays a blue-grey
       dusk atmosphere rather than sliding toward the muddy brown the brief
       called out. */
    fog: '#3d4a63',
    fogNear: FOG_NEAR,
    fogFar: 850,
    /* Darker than day's ground, on purpose — dusk should sit at a lower key
       overall, not just get a colour filter over the daytime values. Widened
       apart from each other for the same reason as day's pair above. */
    ground: '#3f434a',
    yard: '#666b71',
    road: '#15171a',
  },
  night: {
    mast: 1,
    /* Saturated sodium-vapour amber: the ONE warm, saturated thing allowed
       in this look, deliberately, because it is what "pooled mast light
       against a dark plant" actually looks like. */
    mastColor: '#ffb35c',
    /* Turbidity down from 12, rayleigh down from 0.6: both were adding
       scattered brightness to the sky dome that fought "genuinely dark." */
    skyTurbidity: 8,
    skyRayleigh: 0.3,
    /* Cut hard from 0.22: the environment map was contributing almost as
       much fill light at night as the whole hemisphere/ambient budget does
       during the day. That is the single biggest reason night did not read
       as night. */
    envIntensity: 0.1,
    envSky: 0.12,
    envSun: 0.4,
    envGround: 0.05,
    envRim: 0.08,
    /*
     * CHANGED, and this is the actual bug fix in this file.
     *
     * The old position, [-90, 40, -60], is 127.9 degrees off
     * `SITE_VIEW.dir` with a NEGATIVE dot product (-0.615) — solidly in the
     * "direct backlight" failure zone the day-look comment warns about: it
     * sits in front of the camera, in view. `Sky`'s scattering shader always
     * draws a hot spot at `sunPosition` regardless of the paired directional
     * light's intensity, so at `skyTurbidity: 12` that old position was very
     * likely putting a visible glow in the night sky — which would explain
     * "night is not dark" better than any ambient number does.
     *
     * This position mirrors day and dusk's pattern instead: negative X,
     * positive Y and Z, same side as the camera. Verified with
     * `angleToCameraDir`: 66.8 degrees off `SITE_VIEW.dir`, dot product
     * +0.393 — inside the same safe zone as the other two looks, just placed
     * higher (elevation 70 vs 88/34) for a moon rather than a sun.
     */
    sunPosition: [-150, 70, 130],
    /* Same vector, mirrored below the horizon: elevation -19.4 deg drives
       Sky's sunIntensity() to exactly zero. */
    skySunPosition: [-150, -70, 130],
    sunIntensity: 0.18,
    sunColor: '#a8c4ff',
    skyColor: '#131b2c',
    groundColor: '#0a0c10',
    /* Cut hard from 0.22 to 0.07 — the hemisphere fill was flattening every
       shadow the (correctly positioned, now dim) moon and the masts throw.
       This is what actually makes the masts read as pools of light instead
       of one more even wash. */
    ambient: 0.07,
    /* Near-black, not the old '#0d121c' — a real dark anchor for the look
       that most needs one. */
    fog: '#05070c',
    fogNear: FOG_NEAR,
    /* Shortest fogFar of the three: night visibility falling off within a
       couple of hundred metres past the compound reads as correct, where it
       would read as an odd bright plateau at day's 1100 m setting. Still
       comfortably beyond the ~400 m the plant itself needs to stay clear. */
    fogFar: 620,
    ground: '#101216',
    yard: '#151714',
    road: '#08090b',
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
 * The four lightformers that make up the generated environment map, for one
 * look. Formulas are unchanged from the previous inline JSX in
 * `SiteEnvironment` — only the `look.*` values driving them changed above —
 * so this is a straight data-ification, not a re-tune of the rig's geometry.
 */
export function lightformersFor(look: Look): LightformerSpec[] {
  return [
    /* sky dome */
    {
      key: 'sky-dome',
      form: 'rect',
      intensity: look.envSky,
      color: look.skyColor,
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
    /* a cool rim from the opposite side, so the shaded side is not dead */
    {
      key: 'rim-fill',
      form: 'rect',
      intensity: look.envRim,
      color: look.skyColor,
      scale: [40, 20, 1],
      position: [-look.sunPosition[0] * 0.1, 8, -look.sunPosition[2] * 0.1],
      target: [0, 0, 0],
    },
  ];
}
