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

/** Largest feather radius (in pixels) the UI offers. */
export const MAX_FEATHER_RADIUS = 5;

/**
 * Feather (soften) a single-channel 8-bit alpha mask with a separable box blur.
 *
 * The blur is applied once horizontally and once vertically with a kernel of
 * width `2*radius + 1`, sampling clamped at the image borders (edge-extend), so
 * the result is the same size as the input. Repeating a box blur approximates a
 * Gaussian, but a single pass is enough to soften a hard matte edge cheaply and
 * deterministically — and crucially it keeps a fully-opaque interior at 255 and
 * a fully-transparent exterior at 0 (a box blur of a locally-constant region is
 * that same constant), so only the transition band is actually softened.
 *
 * Pure and allocation-light: returns a NEW array and never mutates the input.
 * `radius <= 0` is the identity (a defensive copy of the input).
 *
 * @param alpha  Single-channel alpha, length width*height (0..255).
 * @param width  Image width in pixels (> 0).
 * @param height Image height in pixels (> 0).
 * @param radius Blur radius in pixels (>= 0). Non-integers are rounded.
 */
export function featherAlpha(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('featherAlpha: width and height must be positive integers.');
  }
  if (alpha.length !== width * height) {
    throw new Error(
      `featherAlpha: alpha length ${alpha.length} does not match width*height ${width * height}.`,
    );
  }

  const r = Math.round(radius);
  // Radius 0 (or negative) is a no-op: return a defensive copy.
  if (r <= 0) return new Uint8ClampedArray(alpha);

  const kernel = 2 * r + 1;
  // Horizontal pass: alpha -> tmp (kept as floats to avoid rounding twice).
  const tmp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        // Clamp sample position to the row (edge-extend).
        const sx = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        sum += alpha[row + sx];
      }
      tmp[row + x] = sum / kernel;
    }
  }

  // Vertical pass: tmp -> out (Uint8ClampedArray rounds + clamps for us).
  const out = new Uint8ClampedArray(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const sy = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        sum += tmp[sy * width + x];
      }
      out[y * width + x] = Math.round(sum / kernel);
    }
  }
  return out;
}

/** An axis-aligned bounding box in pixel coordinates (x,y = top-left). */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Compute the tight bounding box of the non-transparent pixels of an alpha mask.
 *
 * Scans the single-channel alpha and returns the smallest rectangle that
 * contains every pixel whose alpha is `>= threshold`. Pixels strictly below the
 * threshold are treated as empty/transparent and excluded. This lets callers
 * crop away the empty transparent border around a subject (e.g. for stickers or
 * product shots) so the subject fills the frame.
 *
 * Returns `null` when no pixel meets the threshold (i.e. the image is fully
 * transparent), signalling "nothing to crop".
 *
 * Pure: reads the input only.
 *
 * @param alpha     Single-channel alpha, length width*height (0..255).
 * @param width     Image width in pixels (> 0).
 * @param height    Image height in pixels (> 0).
 * @param threshold Minimum alpha (inclusive) to count a pixel as part of the
 *                  subject. Defaults to 1 (any non-zero alpha). Clamped to
 *                  [1, 255] so a threshold of 0 cannot select transparent pixels.
 */
export function computeAlphaBBox(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 1,
): BBox | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('computeAlphaBBox: width and height must be positive integers.');
  }
  if (alpha.length !== width * height) {
    throw new Error(
      `computeAlphaBBox: alpha length ${alpha.length} does not match width*height ${width * height}.`,
    );
  }
  // Clamp the threshold so 0 (or negative) does not match transparent pixels,
  // and values above 255 simply never match.
  const t = Math.max(1, Math.min(255, Math.round(threshold)));

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] >= t) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null; // nothing met the threshold

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Crop an RGBA image to a bounding box, returning a NEW, smaller RGBA buffer.
 *
 * The box is intersected with the image bounds, so out-of-range boxes are
 * handled gracefully. Pure: the source is never mutated.
 *
 * @param rgba   Source RGBA, length width*height*4.
 * @param width  Source image width in pixels (> 0).
 * @param height Source image height in pixels (> 0).
 * @param bbox   Rectangle to extract (in source pixel coordinates).
 * @returns `{ data, w, h }` of the cropped region.
 */
export function cropRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bbox: BBox,
): { data: Uint8ClampedArray; w: number; h: number } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('cropRgba: width and height must be positive integers.');
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `cropRgba: rgba length ${rgba.length} does not match width*height*4 ${width * height * 4}.`,
    );
  }
  // Clamp the requested box to the image so we never read out of bounds.
  const x0 = Math.max(0, Math.min(width, Math.floor(bbox.x)));
  const y0 = Math.max(0, Math.min(height, Math.floor(bbox.y)));
  const x1 = Math.max(x0, Math.min(width, Math.floor(bbox.x) + Math.floor(bbox.w)));
  const y1 = Math.max(y0, Math.min(height, Math.floor(bbox.y) + Math.floor(bbox.h)));
  const cw = x1 - x0;
  const ch = y1 - y0;

  const data = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcStart = ((y0 + y) * width + x0) * 4;
    const dstStart = y * cw * 4;
    // Copy a full row of `cw` pixels (cw*4 bytes) in one shot.
    data.set(rgba.subarray(srcStart, srcStart + cw * 4), dstStart);
  }
  return { data, w: cw, h: ch };
}

/**
 * Convenience: trim an RGBA buffer to the tight bounding box of its own
 * non-transparent pixels. Returns the unchanged input (as a fresh buffer) when
 * the subject already fills the frame, and `null` when fully transparent.
 *
 * Combines {@link computeAlphaBBox} and {@link cropRgba}; intended to run on the
 * already-feathered cut-out (feather first, then trim).
 */
export function trimRgbaToAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 1,
): { data: Uint8ClampedArray; w: number; h: number } | null {
  const pixels = width * height;
  if (rgba.length !== pixels * 4) {
    throw new Error(
      `trimRgbaToAlpha: rgba length ${rgba.length} does not match width*height*4 ${pixels * 4}.`,
    );
  }
  const alpha = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) alpha[i] = rgba[i * 4 + 3];
  const bbox = computeAlphaBBox(alpha, width, height, threshold);
  if (!bbox) return null;
  return cropRgba(rgba, width, height, bbox);
}

/**
 * Return a NEW RGBA buffer with a feathered (softened) alpha channel.
 *
 * Extracts the existing alpha channel, blurs it with {@link featherAlpha}, and
 * writes it back over a copy of the source RGBA — RGB channels are untouched.
 * `radius <= 0` yields an exact copy of the input (identity). The input is never
 * mutated.
 *
 * @param rgba   Source RGBA, length width*height*4.
 * @param width  Image width in pixels.
 * @param height Image height in pixels.
 * @param radius Feather radius in pixels.
 */
export function featherRgbaAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const pixels = width * height;
  if (rgba.length !== pixels * 4) {
    throw new Error(
      `featherRgbaAlpha: rgba length ${rgba.length} does not match width*height*4 ${pixels * 4}.`,
    );
  }
  const out = new Uint8ClampedArray(rgba); // copy RGB (and current alpha)
  const r = Math.round(radius);
  if (r <= 0) return out;

  const alpha = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) alpha[i] = rgba[i * 4 + 3];
  const feathered = featherAlpha(alpha, width, height, r);
  for (let i = 0; i < pixels; i++) out[i * 4 + 3] = feathered[i];
  return out;
}
