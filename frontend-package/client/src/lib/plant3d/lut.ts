/**
 * The site's colour-grading LUT — built at runtime, not shipped as a PNG.
 *
 * Plan §4.D.6 / §6a audit correction: "LUT unspecified | Built at runtime
 * with `LookupTexture` (no PNG), placed after tone mapping, authored on
 * display-referred values." A baked PNG would be one more asset this
 * intranet deployment could fail to fetch (PRODUCT.md: "no CDN fetches at
 * runtime") for a grade small enough to compute in a few thousand
 * multiplications once per session.
 *
 * THE GRADE
 * ---------
 * Cool-neutral, per DESIGN.md's target picture (§3.1): "a LUT grade (cool-
 * neutral, +6% contrast, slightly lifted blacks)", refined here to the exact
 * numbers the visual-overhaul plan's workstream D asks for:
 *   - +6% contrast around the 0.5 pivot (per channel)
 *   - blacks lifted +2% (the darkest value in the scene never crushes to a
 *     dead 0 — it sits at 2%)
 *   - a 3% split-tone: shadows nudged toward blue, highlights toward warm,
 *     weighted by the ORIGINAL (pre-grade) luminance of each LUT cell so the
 *     shift reads as "cool shadow / warm highlight", not a flat colour cast
 *     over the whole frame.
 *
 * WHERE THIS SITS IN THE CHAIN, AND WHY
 * --------------------------------------
 * `LUT3DEffect` (what `@react-three/postprocessing`'s `<LUT>` wraps) reads
 * its lookup texture as `inputColorSpace = SRGBColorSpace` by default — i.e.
 * it expects the pixels it grades to already be the DISPLAY-referred image a
 * viewer would see, not the scene's linear HDR values. `ToneMapping` is what
 * turns linear HDR into that display-referred image; a LUT placed BEFORE it
 * would be grading numbers that still have values above 1.0 sitting in them,
 * which is not what any conventional colour-grading LUT (including this one)
 * is authored against. So — per the plan's own §6a audit correction ("LUT
 * ... placed after tone mapping, authored on display-referred values") —
 * `PostFx.tsx` places `<LUT>` AFTER `<ToneMapping>` in the effect chain,
 * not before it, even though an earlier draft of the plan listed LUT before
 * TiltShift and ToneMapping in prose. `scripts/verify-lut.mjs` is the executable
 * proof this ordering (and this grade) behaves: a NEUTRAL LUT rendered into
 * the chain must be a no-op, pixel for pixel, within 1/255 — proving both
 * that the maths here are correct AND that nothing upstream of the LUT stage
 * is already clipping/altering values in a way the LUT would then compound.
 *
 * SIZE
 * ----
 * 32^3 cells (`LookupTexture.createNeutral(32)` is the reference identity
 * this file's neutral-LUT test compares against) — enough resolution that
 * the +6%/+2%/3% grade, which is smooth and low-frequency by construction,
 * shows no visible banding, while staying a one-off ~131 KB Float32Array
 * built once per session (not per frame, not per look).
 */
import { LookupTexture } from 'postprocessing';

/** LUT cube side length. Matches the reference neutral LUT this file's own
 *  identity test (`scripts/verify-lut.mjs`) compares against. */
export const LUT_SIZE = 32;

/** +6% contrast around the 0.5 pivot. */
const CONTRAST = 1.06;
/** Blacks lifted 2%: 0 -> 0.02, 1 -> 1.0 (a simple lerp toward the lift). */
const BLACK_LIFT = 0.02;
/** Magnitude of the shadow-cool / highlight-warm split-tone. */
const SPLIT_TONE = 0.03;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The grade, applied to one RGB triple in 0..1. Pure — no `three` or
 * `postprocessing` dependency — so `scripts/verify-lut.mjs` (and any future
 * check) can exercise the maths on its own without booting a renderer.
 */
export function gradeCoolNeutral(r0: number, g0: number, b0: number): [number, number, number] {
  /* Contrast, per channel, around the 0.5 pivot. */
  let r = (r0 - 0.5) * CONTRAST + 0.5;
  let g = (g0 - 0.5) * CONTRAST + 0.5;
  let b = (b0 - 0.5) * CONTRAST + 0.5;

  /* Lifted blacks — a lerp toward BLACK_LIFT rather than a flat add, so the
     white point (1.0) is untouched and only the low end rises. */
  r = r * (1 - BLACK_LIFT) + BLACK_LIFT;
  g = g * (1 - BLACK_LIFT) + BLACK_LIFT;
  b = b * (1 - BLACK_LIFT) + BLACK_LIFT;

  /* Split-tone, weighted by the ORIGINAL (pre-grade) luminance of this cell —
     using the input rather than the already-contrast/lift-adjusted value
     keeps the shadow/highlight split keyed to the same place a viewer would
     call "shadow" or "highlight" in the source image, not shifted by the
     grade that is about to run on top of it. Rec. 709 luma weights, cheap
     and standard for this kind of small display-referred grade. */
  const lum = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
  const shadowWeight = (1 - lum) ** 2;
  const highlightWeight = lum ** 2;
  /* Blue into the shadows, a little red taken out so it reads as cool, not
     just "more blue"; warm (red up, blue down) into the highlights. Green is
     left as the pivot channel, per the usual split-tone convention — moving
     it too produces a magenta/green cast rather than a warm/cool one. */
  r += highlightWeight * SPLIT_TONE - shadowWeight * SPLIT_TONE * 0.4;
  b += shadowWeight * SPLIT_TONE - highlightWeight * SPLIT_TONE * 0.4;

  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * Builds the RGBA Float32Array a `LookupTexture` expects: `size^3` cells,
 * index `(r + g*size + b*size*size) * 4` — the same layout
 * `LookupTexture.createNeutral` uses (verified against
 * `node_modules/postprocessing/build/index.js`'s own `createNeutral`), so a
 * neutral grade built through this function is byte-for-byte the identity
 * transform `scripts/verify-lut.mjs` compares against.
 */
export function buildLutData(
  size: number,
  grade: (r: number, g: number, b: number) => [number, number, number],
): Float32Array {
  const data = new Float32Array(size ** 3 * 4);
  const sizeSq = size * size;
  const s = 1 / (size - 1);
  for (let bi = 0; bi < size; bi += 1) {
    for (let gi = 0; gi < size; gi += 1) {
      for (let ri = 0; ri < size; ri += 1) {
        const [r, g, b] = grade(ri * s, gi * s, bi * s);
        const i4 = (ri + gi * size + bi * sizeSq) * 4;
        data[i4] = r;
        data[i4 + 1] = g;
        data[i4 + 2] = b;
        data[i4 + 3] = 1;
      }
    }
  }
  return data;
}

/** The site's grade, as a ready-to-use `LookupTexture`. Built once (see
 *  `PostFx.tsx`'s `useMemo`), not per frame or per look — the grade does not
 *  change with time of day; the LOOK'S contribution to mood lives in the sky,
 *  the sun and the exposure, not in this fixed post-grade. */
export function makeCoolNeutralLUT(size: number = LUT_SIZE): LookupTexture {
  const data = buildLutData(size, gradeCoolNeutral);
  const lut = new LookupTexture(data, size);
  lut.name = 'fakieh-cool-neutral';
  return lut;
}

/** Identity grade — the no-op every other cell in `buildLutData` is compared
 *  against by `scripts/verify-lut.mjs`. Exported so that script does not
 *  have to hand-roll a second "is this actually neutral" implementation. */
export function gradeIdentity(r: number, g: number, b: number): [number, number, number] {
  return [r, g, b];
}

export function makeNeutralLUT(size: number = LUT_SIZE): LookupTexture {
  const data = buildLutData(size, gradeIdentity);
  const lut = new LookupTexture(data, size);
  lut.name = 'neutral';
  return lut;
}
