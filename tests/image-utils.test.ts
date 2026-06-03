import { describe, it, expect } from 'vitest';
import {
  applyAlphaMask,
  flattenOntoBackground,
  hexToRgb,
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
