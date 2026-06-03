/**
 * Pure, dependency-free image/math helpers.
 *
 * These operate on plain typed arrays so they can be unit-tested in Node
 * without any DOM or AI runtime. Everything here is deterministic and pure.
 */

/**
 * Composite a single-channel 8-bit alpha mask onto an RGBA buffer in place.
 *
 * The mask is the model's foreground probability per pixel (0 = background,
 * 255 = foreground). We multiply it into the existing alpha channel so that
 * already-transparent pixels stay transparent.
 *
 * @param rgba   Uint8ClampedArray of length width*height*4 (mutated in place).
 * @param mask   Uint8Array | Uint8ClampedArray of length width*height.
 * @returns the same `rgba` reference for convenience.
 */
export function applyAlphaMask(
  rgba: Uint8ClampedArray,
  mask: Uint8Array | Uint8ClampedArray,
): Uint8ClampedArray {
  const pixels = mask.length;
  if (rgba.length !== pixels * 4) {
    throw new Error(
      `applyAlphaMask: rgba length ${rgba.length} does not match mask length ${pixels} (expected ${pixels * 4}).`,
    );
  }
  for (let i = 0; i < pixels; i++) {
    const existing = rgba[i * 4 + 3];
    // Normalised multiply: keep prior transparency, gate by mask.
    rgba[i * 4 + 3] = Math.round((existing * mask[i]) / 255);
  }
  return rgba;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Flatten an RGBA (with arbitrary alpha) image onto a solid opaque background.
 *
 * Produces a NEW fully-opaque RGBA buffer using the standard
 * "source-over" alpha compositing formula:  out = fg*a + bg*(1-a).
 *
 * @param rgba  Source RGBA (not mutated).
 * @param bg    Background colour (0-255 per channel).
 */
export function flattenOntoBackground(
  rgba: Uint8ClampedArray,
  bg: RGB,
): Uint8ClampedArray {
  if (rgba.length % 4 !== 0) {
    throw new Error('flattenOntoBackground: rgba length must be a multiple of 4.');
  }
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    const inv = 1 - a;
    out[i] = Math.round(rgba[i] * a + bg.r * inv);
    out[i + 1] = Math.round(rgba[i + 1] * a + bg.g * inv);
    out[i + 2] = Math.round(rgba[i + 2] * a + bg.b * inv);
    out[i + 3] = 255;
  }
  return out;
}

/**
 * Parse a #rrggbb (or #rgb) hex colour string into an RGB triple.
 * Throws on malformed input.
 */
export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) {
    throw new Error(`hexToRgb: invalid hex colour "${hex}".`);
  }
  let h = m[1];
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** White convenience constant. */
export const WHITE: RGB = { r: 255, g: 255, b: 255 };
