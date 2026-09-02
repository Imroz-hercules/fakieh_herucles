/**
 * Pure helpers for `verify-picture.mjs`: threshold configuration and colour
 * math.
 *
 * WHY THE COLOUR MATH LIVES HERE AND NOT INLINE IN THE PAGE SCRIPT
 * ------------------------------------------------------------------
 * The material-separability check needs to convert rendered pixels to Lab and
 * run CIEDE2000 INSIDE the headless page — the alternative is shipping raw
 * pixel buffers back over the CDP wire, which is the same mistake this file's
 * header comment already warns about for pixel reads in general. But writing
 * the maths twice — once here for anything Node-side wants, once again as a
 * hand-copied string inside a template literal — is exactly how two
 * implementations quietly drift apart and a check starts measuring something
 * other than what its name says.
 *
 * So `rgbToLab` and `deltaE00` are written as ordinary named `function`
 * declarations, with no closures over anything outside their own body, no
 * arrow syntax, and no template literals in their source — specifically so
 * `fn.toString()` yields a self-contained, directly-embeddable function body.
 * `verify-picture.mjs` builds its page-side script by concatenating
 * `rgbToLab.toString()` and `deltaE00.toString()` ahead of the code that
 * calls them. One implementation, proven by the fact that the same source
 * runs in both places.
 */

/* ------------------------------------------------------------------ */
/* Thresholds                                                          */
/* ------------------------------------------------------------------ */

/**
 * Floors for the new picture checks. Like the coverage/band floors already in
 * `verify-picture.mjs`, these are regression floors, not targets: DESIGN.md
 * states the actual targets ("mid-tones must stay >= 30% day / >= 22% dusk")
 * and the plan (workstream D) states today's measured baseline is far below
 * them (9% / 8%) — these defaults ARE the DESIGN.md targets, deliberately set
 * ahead of what the current build achieves, so the check is honest about
 * failing today rather than tuned to pass.
 */
export const DEFAULT_THRESHOLDS = {
  midtone: {
    /* fraction of pixels with luminance in [0.25, 0.75], full composed frame */
    day: { wholeSite: 0.30, zone: 0.35 },
    dusk: { wholeSite: 0.22 },
  },
  histogram: {
    /*
     * Three independent measures, kept together because they are testing the
     * same underlying failure (a crushed, blown-out, or split-peak picture)
     * from three different angles. "No single decile > 30%" alone passes a
     * frame with two separated ~25% peaks either side of a dark trough — a
     * textbook bimodal histogram that never trips a per-bucket cap. So:
     *   maxDecileShare  — the original per-bucket cap, kept because it still
     *                      catches the crushed/blown-out case cleanly.
     *   minMidShare3to7 — the share of pixels in DECILES 3-7 (1-based —
     *                      luminance [0.2, 0.7)), which a bimodal split
     *                      starves even when no single decile is over the
     *                      cap.
     *   maxBimodality   — Sarle's bimodality coefficient, (skewness^2 + 1) /
     *                      kurtosis, over the full luminance distribution.
     *                      Unlike the two bucket-based measures this is
     *                      shape-sensitive rather than threshold-sensitive:
     *                      a normal distribution scores ~0.33, a uniform one
     *                      ~0.56; higher means more bimodal/platykurtic.
     */
    day: { maxDecileShare: 0.30, minMidShare3to7: 0.40, maxBimodality: 0.66 },
    dusk: { minMidShare3to7: 0.30 },
  },
  siloTonalRange: {
    /* p90 - p10 of luminance, over MASK-identified silo pixels only */
    minP10P90Spread: 0.22,
  },
  materialSeparability: {
    /*
     * Two jobs, one number: a mask pixel "matches" a material if its
     * rendered colour is within this CIEDE2000 distance of the material's
     * legend swatch (used to gather the pixels a material's rendered median
     * colour is computed from), and separately each material's rendered
     * MEDIAN colour must itself land within this same distance of its own
     * swatch — see the material-separability check for both uses.
     */
    deltaEWindow: 25,
    /* a material's rendered median is not trusted below this many matched
       pixels — reported as a failure ("too few matched pixels"), not
       silently skipped. */
    minPixels: 40,
    /*
     * The separability requirement proper: among the materials actually
     * visible in the current zone, the SMALLEST pairwise ΔE00 between their
     * rendered median colours must be at least this fraction of the smallest
     * pairwise ΔE00 between their TARGET swatches. 1.0 would demand the
     * render preserve the legend's full separation; 0.6 accepts some loss to
     * lighting/shading while still catching two materials that render
     * indistinguishably despite having visibly different swatches.
     */
    minPairwiseRatio: 0.6,
    /*
     * Forced-fail hook, not a real tuning knob: keyed by the exact legend
     * material NAME (as rendered in the DOM), value a "#rrggbb" string to
     * substitute for the swatch colour actually read off the page before
     * computing ΔE. Empty by default. See the header of verify-picture.mjs
     * for how this proves check 4 can fail.
     */
    swatchOverride: {},
  },
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return patch === undefined ? base : patch;
  if (!isPlainObject(base)) base = {};
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    out[key] = deepMerge(base[key], patch[key]);
  }
  return out;
}

/**
 * Reads `PICTURE_THRESHOLDS_JSON` (a partial, deep-mergeable patch over
 * `DEFAULT_THRESHOLDS`) and returns the effective thresholds plus where they
 * came from, so the caller can print it rather than leave it a silent guess.
 */
export function loadThresholds(env = process.env) {
  const raw = env.PICTURE_THRESHOLDS_JSON;
  if (!raw || !raw.trim()) {
    return { thresholds: DEFAULT_THRESHOLDS, source: 'default', raw: null };
  }
  let patch;
  try {
    patch = JSON.parse(raw);
  } catch (err) {
    throw new Error(`PICTURE_THRESHOLDS_JSON is not valid JSON: ${err.message}`);
  }
  return { thresholds: deepMerge(DEFAULT_THRESHOLDS, patch), source: 'PICTURE_THRESHOLDS_JSON', raw };
}

/* ------------------------------------------------------------------ */
/* Colour math — embeddable verbatim into the headless page            */
/* ------------------------------------------------------------------ */

/**
 * sRGB (0..255 each) -> CIELab (D65). Standard matrices/constants; no
 * dependency on anything outside this function so it stays embeddable.
 */
export function rgbToLab(r, g, b) {
  function toLin(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  var rl = toLin(r);
  var gl = toLin(g);
  var bl = toLin(b);
  var x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  var y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750;
  var z = rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041;
  var xn = x / 0.95047;
  var yn = y / 1.0;
  var zn = z / 1.08883;
  function f(t) {
    return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
  }
  var fx = f(xn);
  var fy = f(yn);
  var fz = f(zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIEDE2000 between two Lab triples (each `[L, a, b]`). The standard
 * Sharma/Wu/Dalal formulation. Returns a non-negative distance; 0 is
 * identical colour, values above ~25 are generally distinguishable at a
 * glance even under different rendering conditions.
 */
export function deltaE00(lab1, lab2) {
  var kL = 1, kC = 1, kH = 1;
  var L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
  var L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
  var C1 = Math.sqrt(a1 * a1 + b1 * b1);
  var C2 = Math.sqrt(a2 * a2 + b2 * b2);
  var Cbar = (C1 + C2) / 2;
  var Cbar7 = Math.pow(Cbar, 7);
  var pow25_7 = Math.pow(25, 7);
  var G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + pow25_7)));
  var a1p = (1 + G) * a1;
  var a2p = (1 + G) * a2;
  var C1p = Math.sqrt(a1p * a1p + b1 * b1);
  var C2p = Math.sqrt(a2p * a2p + b2 * b2);
  function hAngle(ap, b) {
    if (ap === 0 && b === 0) return 0;
    var h = (Math.atan2(b, ap) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  }
  var h1p = hAngle(a1p, b1);
  var h2p = hAngle(a2p, b2);
  var deltaLp = L2 - L1;
  var deltaCp = C2p - C1p;
  var deltahp;
  if (C1p * C2p === 0) {
    deltahp = 0;
  } else {
    var dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
    deltahp = dh;
  }
  var deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(((deltahp * Math.PI) / 180) / 2);
  var Lbarp = (L1 + L2) / 2;
  var Cbarp = (C1p + C2p) / 2;
  var hbarp;
  if (C1p * C2p === 0) {
    hbarp = h1p + h2p;
  } else {
    var dsum = h1p + h2p;
    var adiff = Math.abs(h1p - h2p);
    if (adiff <= 180) hbarp = dsum / 2;
    else if (dsum < 360) hbarp = (dsum + 360) / 2;
    else hbarp = (dsum - 360) / 2;
  }
  var T =
    1 -
    0.17 * Math.cos(((hbarp - 30) * Math.PI) / 180) +
    0.24 * Math.cos(((2 * hbarp) * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hbarp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hbarp - 63) * Math.PI) / 180);
  var deltaTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  var Cbarp7 = Math.pow(Cbarp, 7);
  var Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + pow25_7));
  var Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  var Sc = 1 + 0.045 * Cbarp;
  var Sh = 1 + 0.015 * Cbarp * T;
  var Rt = -Math.sin(((2 * deltaTheta) * Math.PI) / 180) * Rc;
  var termL = deltaLp / (kL * Sl);
  var termC = deltaCp / (kC * Sc);
  var termH = deltaHp / (kH * Sh);
  return Math.sqrt(termL * termL + termC * termC + termH * termH + Rt * termC * termH);
}

/** "#rrggbb" or "rgb(r, g, b)" -> [r, g, b], all 0..255. Node-side only (not
    embedded in the page — the page reads colours via getComputedStyle, which
    always yields the rgb() form already). */
export function parseColor(input) {
  if (typeof input !== 'string') return null;
  const hex = input.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = input.trim().match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}
