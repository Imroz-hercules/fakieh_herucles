/**
 * Runtime-generated textures for the silo shader.
 *
 * Split out of `siloShader.ts` so the shader module stays shader — this file's
 * job is a Canvas 2D `ImageData` fill, not GLSL, and mixing the two made the
 * file harder to scan for the one thing every past incident here actually
 * involved: a stray backtick inside a GLSL template literal. Neither file
 * needs to touch the other's kind of content.
 */
import * as THREE from 'three';

/**
 * The corrugation tile, real feed-mill pitch.
 *
 * 64 wide (no horizontal variation — a corrugated sheet's ribs run vertically,
 * parallel to the barrel axis, so the tile only has to vary along V) by 256
 * tall, banded into 8 ridges of 32 px each. The shader samples this with
 * `vY / 0.28 / 8.0` as the V coordinate (see `siloShader.ts`), so one full
 * 256 px tile spans 8 x 0.28 m = 2.24 m of real, unexaggerated barrel height —
 * the same physical spacing on a 0.45 m micro hopper and a 30 m bulk tank,
 * because it is keyed to object-space metres rather than to anything that
 * scales with the drawing.
 */
const TILE_W = 64;
const TILE_H = 256;
const RIDGES_PER_TILE = 8;
const BAND_PX = TILE_H / RIDGES_PER_TILE;

/** Half-width, in ridge-phase units, of the dark groove painted at each trough. */
const GROOVE_HALF_WIDTH = 0.08;

let cached: THREE.CanvasTexture | null = null;

/**
 * A tangent-space normal tile encoding a sine ridge profile, generated once
 * and cached for the life of the page.
 *
 * RG carry the tilt (R flat — ribs do not lean sideways along this axis — G
 * the sine profile's slope, which is what a real ridge's surface actually
 * tilts by, not the height itself), B is "up" (a flat tangent-space normal
 * map's constant third channel), and A is a groove mask: a narrow dark band
 * at each trough, where a real ridged sheet self-shadows.
 *
 * Returns a 1x1 white stand-in outside a DOM environment (Node's headless
 * checks import this module without ever calling this function, but nothing
 * stops a future caller from doing so somewhere `document` does not exist,
 * and a thrown exception there would be a strange way to fail a shader
 * check that never asked about textures).
 */
export function makeCorrugationNormal(): THREE.CanvasTexture {
  if (cached) return cached;

  if (typeof document === 'undefined') {
    const flat = new Uint8Array([128, 128, 255, 255]);
    const tex = new THREE.DataTexture(flat, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    cached = tex as unknown as THREE.CanvasTexture;
    return cached;
  }

  const canvas = document.createElement('canvas');
  canvas.width = TILE_W;
  canvas.height = TILE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('makeCorrugationNormal: no 2D context — the shell wall would render flat');
  }

  const img = ctx.createImageData(TILE_W, TILE_H);
  const data = img.data;
  for (let y = 0; y < TILE_H; y += 1) {
    const phase = (y % BAND_PX) / BAND_PX; // 0..1 within one ridge cycle
    const angle = phase * Math.PI * 2;
    // The ridge SLOPE, not the ridge height: a sine profile's surface tilts
    // by its derivative, cosine, which is what the shader's normal-tilt trick
    // actually wants.
    const slope = Math.cos(angle);
    const ny = Math.round((0.5 + 0.5 * slope) * 255);

    // The trough sits at the profile's minimum, phase 0.75 for a cosine slope
    // (where the sine height itself is falling fastest away from its peak).
    const dPhase = Math.min(Math.abs(phase - 0.75), 1 - Math.abs(phase - 0.75));
    const groove = Math.round(Math.max(0, 1 - dPhase / GROOVE_HALF_WIDTH) * 255);

    for (let x = 0; x < TILE_W; x += 1) {
      const i = (y * TILE_W + x) * 4;
      data[i] = 128; // R — flat; the rib runs straight along the barrel axis
      data[i + 1] = ny; // G — the tilt the shader reads
      data[i + 2] = 255; // B — up
      data[i + 3] = groove; // A — the groove mask
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  /* This is data, not a photograph — decoding it through the sRGB transfer
     function the way an albedo texture would be would distort every one of
     its four channels for no reason; NoColorSpace is what a normal/mask
     texture is supposed to use (see r3f-materials SKILL.md). */
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
