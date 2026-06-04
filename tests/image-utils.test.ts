import { describe, it, expect } from 'vitest';
import {
  applyAlphaMask,
  computeAlphaBBox,
  cropRgba,
  featherAlpha,
  featherRgbaAlpha,
  flattenOntoBackground,
  hexToRgb,
  trimRgbaToAlpha,
  WHITE,
} from '../src/lib/image-utils';

describe('applyAlphaMask', () => {
  it('gates the alpha channel by the mask (multiply-normalised)', () => {
    // 2 pixels, both fully opaque to start.
    const rgba = new Uint8ClampedArray([
      10, 20, 30, 255, // px0
      40, 50, 60, 255, // px1
    ]);
    const mask = new Uint8Array([255, 0]); // keep px0, drop px1
    applyAlphaMask(rgba, mask);
    expect(rgba[3]).toBe(255); // px0 fully kept
    expect(rgba[7]).toBe(0); // px1 fully removed
    // RGB untouched.
    expect([...rgba.slice(0, 3)]).toEqual([10, 20, 30]);
  });

  it('preserves pre-existing transparency (compounds alphas)', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 128]); // already half transparent
    const mask = new Uint8Array([128]); // mask ~50%
    applyAlphaMask(rgba, mask);
    // 128 * 128 / 255 = 64.25 -> 64
    expect(rgba[3]).toBe(64);
  });

  it('handles a mid-grey mask correctly', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
    applyAlphaMask(rgba, new Uint8Array([200]));
    expect(rgba[3]).toBe(200);
  });

  it('throws when lengths mismatch', () => {
    expect(() =>
      applyAlphaMask(new Uint8ClampedArray(8), new Uint8Array([1])),
    ).toThrow(/does not match/);
  });

  it('returns the same buffer reference', () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 255]);
    expect(applyAlphaMask(rgba, new Uint8Array([255]))).toBe(rgba);
  });
});

describe('flattenOntoBackground', () => {
  it('leaves fully-opaque pixels unchanged', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 255]);
    const out = flattenOntoBackground(rgba, WHITE);
    expect([...out]).toEqual([100, 150, 200, 255]);
  });

  it('replaces fully-transparent pixels with the background color', () => {
    const rgba = new Uint8ClampedArray([100, 150, 200, 0]);
    const out = flattenOntoBackground(rgba, { r: 0, g: 0, b: 0 });
    expect([...out]).toEqual([0, 0, 0, 255]);
  });

  it('blends a half-transparent pixel via source-over', () => {
    // fg white at 50% over black bg -> ~128 each channel.
    const rgba = new Uint8ClampedArray([255, 255, 255, 128]);
    const out = flattenOntoBackground(rgba, { r: 0, g: 0, b: 0 });
    // 255*0.502 + 0*0.498 = 128.01 -> 128
    expect(out[0]).toBe(128);
    expect(out[3]).toBe(255);
  });

  it('does not mutate the input', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 0]);
    flattenOntoBackground(rgba, WHITE);
    expect(rgba[3]).toBe(0);
  });

  it('throws on non-multiple-of-4 length', () => {
    expect(() => flattenOntoBackground(new Uint8ClampedArray(3), WHITE)).toThrow();
  });
});

describe('featherAlpha', () => {
  /** Build a width x height alpha mask with the left half opaque, right half clear. */
  function leftHalfMask(width: number, height: number): Uint8Array {
    const a = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        a[y * width + x] = x < width / 2 ? 255 : 0;
      }
    }
    return a;
  }

  it('radius 0 is the identity (value-equal, fresh copy)', () => {
    const src = new Uint8Array([0, 64, 128, 255, 200, 5]);
    const out = featherAlpha(src, 3, 2, 0);
    expect([...out]).toEqual([...src]);
    // It must be a copy, not the same reference (so callers can mutate safely).
    expect(out).not.toBe(src as unknown);
  });

  it('preserves a fully-opaque interior and fully-transparent exterior', () => {
    const w = 9;
    const h = 9;
    // 3x3 opaque block centered in a 9x9 transparent field.
    const a = new Uint8Array(w * h);
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) a[y * w + x] = 255;
    const out = featherAlpha(a, w, h, 1);
    // Dead center stays fully opaque (its whole 3x3 neighborhood is 255).
    expect(out[4 * w + 4]).toBe(255);
    // A far corner stays fully transparent (its neighborhood is all 0).
    expect(out[0]).toBe(0);
    expect(out[w * h - 1]).toBe(0);
  });

  it('widens the soft transition band at the edge', () => {
    const w = 8;
    const h = 1;
    const a = leftHalfMask(w, h); // [255,255,255,255,0,0,0,0]
    const hard = featherAlpha(a, w, h, 0);
    const soft = featherAlpha(a, w, h, 2);

    // Count pixels that are strictly between 0 and 255 (the soft band).
    const band = (arr: ArrayLike<number>) => {
      let n = 0;
      for (let i = 0; i < arr.length; i++) if (arr[i] > 0 && arr[i] < 255) n++;
      return n;
    };
    expect(band(hard)).toBe(0); // hard edge: no intermediate values
    expect(band(soft)).toBeGreaterThan(band(hard)); // blur creates a gradient
  });

  it('produces a monotonic ramp across a vertical edge', () => {
    const w = 6;
    const a = leftHalfMask(w, 1);
    const out = featherAlpha(a, w, 1, 1);
    // Non-increasing left-to-right (opaque -> transparent).
    for (let x = 1; x < w; x++) expect(out[x]).toBeLessThanOrEqual(out[x - 1]);
  });

  it('throws on bad dimensions or mismatched length', () => {
    expect(() => featherAlpha(new Uint8Array(4), 0, 1, 1)).toThrow();
    expect(() => featherAlpha(new Uint8Array(5), 2, 2, 1)).toThrow(/does not match/);
  });
});

describe('featherRgbaAlpha', () => {
  it('radius 0 returns an exact copy and leaves the input untouched', () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 0]);
    const out = featherRgbaAlpha(rgba, 2, 1, 0);
    expect([...out]).toEqual([...rgba]);
    expect(out).not.toBe(rgba);
  });

  it('softens alpha while leaving RGB channels intact', () => {
    const w = 4;
    const h = 1;
    // Two opaque colored pixels, then two transparent ones.
    const rgba = new Uint8ClampedArray([
      11, 22, 33, 255,
      44, 55, 66, 255,
      77, 88, 99, 0,
      10, 20, 30, 0,
    ]);
    const out = featherRgbaAlpha(rgba, w, h, 1);
    // RGB untouched everywhere.
    for (let i = 0; i < w; i++) {
      expect([out[i * 4], out[i * 4 + 1], out[i * 4 + 2]]).toEqual([
        rgba[i * 4],
        rgba[i * 4 + 1],
        rgba[i * 4 + 2],
      ]);
    }
    // The boundary pixels now carry an intermediate alpha.
    expect(out[1 * 4 + 3]).toBeLessThan(255);
    expect(out[2 * 4 + 3]).toBeGreaterThan(0);
    // Original buffer not mutated.
    expect(rgba[1 * 4 + 3]).toBe(255);
  });

  it('throws when rgba length does not match width*height*4', () => {
    expect(() => featherRgbaAlpha(new Uint8ClampedArray(7), 2, 1, 1)).toThrow(
      /does not match/,
    );
  });
});

describe('computeAlphaBBox', () => {
  /** Build a width*height alpha mask, all zero. */
  const blank = (w: number, h: number) => new Uint8Array(w * h);

  it('finds the tight box of a centered opaque square', () => {
    const w = 10;
    const h = 10;
    const a = blank(w, h);
    // Opaque 4x3 block: x in [3,6], y in [2,4].
    for (let y = 2; y <= 4; y++) for (let x = 3; x <= 6; x++) a[y * w + x] = 255;
    expect(computeAlphaBBox(a, w, h)).toEqual({ x: 3, y: 2, w: 4, h: 3 });
  });

  it('returns null for a fully-transparent image', () => {
    expect(computeAlphaBBox(blank(5, 5), 5, 5)).toBeNull();
  });

  it('returns the full image when the subject fills the frame', () => {
    const w = 4;
    const h = 3;
    const a = new Uint8Array(w * h).fill(255);
    expect(computeAlphaBBox(a, w, h)).toEqual({ x: 0, y: 0, w, h });
  });

  it('finds a 1px subject', () => {
    const w = 7;
    const h = 5;
    const a = blank(w, h);
    a[3 * w + 5] = 200; // single pixel at (5,3)
    expect(computeAlphaBBox(a, w, h)).toEqual({ x: 5, y: 3, w: 1, h: 1 });
  });

  it('respects the threshold (faint pixels below it are excluded)', () => {
    const w = 5;
    const h = 1;
    const a = new Uint8Array([0, 40, 200, 40, 0]);
    // threshold 1: pixels 1..3 count -> x:1 w:3
    expect(computeAlphaBBox(a, w, h, 1)).toEqual({ x: 1, y: 0, w: 3, h: 1 });
    // threshold 100: only the 200 pixel counts -> x:2 w:1
    expect(computeAlphaBBox(a, w, h, 100)).toEqual({ x: 2, y: 0, w: 1, h: 1 });
    // threshold above any value -> null
    expect(computeAlphaBBox(a, w, h, 255)).toBeNull();
  });

  it('treats threshold <= 0 as 1 (never selects transparent pixels)', () => {
    const a = new Uint8Array([0, 0, 5, 0]);
    expect(computeAlphaBBox(a, 4, 1, 0)).toEqual({ x: 2, y: 0, w: 1, h: 1 });
    expect(computeAlphaBBox(a, 4, 1, -10)).toEqual({ x: 2, y: 0, w: 1, h: 1 });
  });

  it('throws on bad dimensions or mismatched length', () => {
    expect(() => computeAlphaBBox(new Uint8Array(4), 0, 1, 1)).toThrow();
    expect(() => computeAlphaBBox(new Uint8Array(5), 2, 2, 1)).toThrow(/does not match/);
  });
});

describe('cropRgba', () => {
  /** Build a w*h RGBA where each pixel encodes its (x,y) for easy assertions. */
  function coordImage(w: number, h: number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = x;
        data[i + 1] = y;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    return data;
  }

  it('extracts the requested rectangle with correct pixels', () => {
    const w = 4;
    const h = 4;
    const img = coordImage(w, h);
    const out = cropRgba(img, w, h, { x: 1, y: 2, w: 2, h: 1 });
    expect(out.w).toBe(2);
    expect(out.h).toBe(1);
    // Pixel (0,0) of the crop is source (1,2); (1,0) is source (2,2).
    expect([out.data[0], out.data[1]]).toEqual([1, 2]);
    expect([out.data[4], out.data[5]]).toEqual([2, 2]);
  });

  it('returns an equivalent (but fresh) buffer for a full-image box', () => {
    const w = 3;
    const h = 2;
    const img = coordImage(w, h);
    const out = cropRgba(img, w, h, { x: 0, y: 0, w, h });
    expect(out.w).toBe(w);
    expect(out.h).toBe(h);
    expect([...out.data]).toEqual([...img]);
    expect(out.data).not.toBe(img);
  });

  it('clamps a box that extends past the image bounds', () => {
    const w = 3;
    const h = 3;
    const img = coordImage(w, h);
    const out = cropRgba(img, w, h, { x: 2, y: 2, w: 10, h: 10 });
    expect(out.w).toBe(1);
    expect(out.h).toBe(1);
    expect([out.data[0], out.data[1]]).toEqual([2, 2]);
  });

  it('throws on mismatched rgba length', () => {
    expect(() => cropRgba(new Uint8ClampedArray(7), 2, 1, { x: 0, y: 0, w: 1, h: 1 })).toThrow(
      /does not match/,
    );
  });
});

describe('trimRgbaToAlpha', () => {
  it('crops to the subject and drops transparent margins', () => {
    const w = 5;
    const h = 5;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Opaque red 2x2 block at x in [1,2], y in [1,2].
    for (let y = 1; y <= 2; y++) {
      for (let x = 1; x <= 2; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = 255;
        rgba[i + 3] = 255;
      }
    }
    const out = trimRgbaToAlpha(rgba, w, h);
    expect(out).not.toBeNull();
    expect(out!.w).toBe(2);
    expect(out!.h).toBe(2);
    // Every pixel of the crop is opaque red.
    for (let i = 0; i < out!.data.length; i += 4) {
      expect(out!.data[i]).toBe(255);
      expect(out!.data[i + 3]).toBe(255);
    }
  });

  it('returns null when fully transparent', () => {
    const rgba = new Uint8ClampedArray(3 * 3 * 4); // all alpha 0
    expect(trimRgbaToAlpha(rgba, 3, 3)).toBeNull();
  });

  it('leaves a full-frame subject unchanged in size', () => {
    const w = 2;
    const h = 2;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 255;
    const out = trimRgbaToAlpha(rgba, w, h);
    expect(out).not.toBeNull();
    expect(out!.w).toBe(w);
    expect(out!.h).toBe(h);
    expect([...out!.data]).toEqual([...rgba]);
  });

  it('throws on mismatched rgba length', () => {
    expect(() => trimRgbaToAlpha(new Uint8ClampedArray(7), 2, 1)).toThrow(/does not match/);
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#3b82f6')).toEqual({ r: 59, g: 130, b: 246 });
  });
  it('parses without leading hash', () => {
    expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });
  it('parses 3-digit shorthand', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });
  it('throws on invalid input', () => {
    expect(() => hexToRgb('nope')).toThrow(/invalid hex/);
    expect(() => hexToRgb('#12')).toThrow();
  });
});
