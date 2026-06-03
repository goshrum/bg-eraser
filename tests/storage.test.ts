import { describe, it, expect } from 'vitest';
import {
  BG_COLOR_KEY,
  isHexColor,
  loadBgColor,
  saveBgColor,
  type StorageLike,
} from '../src/lib/storage';

/** Tiny in-memory Storage stub. */
function memStorage(initial: Record<string, string> = {}): StorageLike & {
  store: Record<string, string>;
} {
  const store = { ...initial };
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
  };
}

/** A Storage stub whose every access throws (private-mode simulation). */
const throwingStorage: StorageLike = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
};

describe('isHexColor', () => {
  it('accepts 6-digit #rrggbb', () => {
    expect(isHexColor('#3b82f6')).toBe(true);
    expect(isHexColor('#FFFFFF')).toBe(true);
  });
  it('rejects shorthand, missing hash, and non-strings', () => {
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('3b82f6')).toBe(false);
    expect(isHexColor('#zzzzzz')).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(123)).toBe(false);
  });
});

describe('loadBgColor', () => {
  it('returns the stored color when valid', () => {
    const s = memStorage({ [BG_COLOR_KEY]: '#112233' });
    expect(loadBgColor(s, '#000000')).toBe('#112233');
  });
  it('returns the fallback when nothing is stored', () => {
    expect(loadBgColor(memStorage(), '#abcabc')).toBe('#abcabc');
  });
  it('returns the fallback when the stored value is invalid', () => {
    const s = memStorage({ [BG_COLOR_KEY]: 'garbage' });
    expect(loadBgColor(s, '#abcabc')).toBe('#abcabc');
  });
  it('returns the fallback for null storage', () => {
    expect(loadBgColor(null, '#abcabc')).toBe('#abcabc');
  });
  it('returns the fallback (never throws) when storage access fails', () => {
    expect(loadBgColor(throwingStorage, '#abcabc')).toBe('#abcabc');
  });
});

describe('saveBgColor', () => {
  it('writes a valid color and reports success', () => {
    const s = memStorage();
    expect(saveBgColor(s, '#445566')).toBe(true);
    expect(s.store[BG_COLOR_KEY]).toBe('#445566');
  });
  it('refuses to write an invalid color', () => {
    const s = memStorage();
    expect(saveBgColor(s, 'nope')).toBe(false);
    expect(BG_COLOR_KEY in s.store).toBe(false);
  });
  it('reports failure (never throws) when storage access fails', () => {
    expect(saveBgColor(throwingStorage, '#445566')).toBe(false);
  });
  it('returns false for null storage', () => {
    expect(saveBgColor(null, '#445566')).toBe(false);
  });

  it('round-trips through load', () => {
    const s = memStorage();
    saveBgColor(s, '#0a0b0c');
    expect(loadBgColor(s, '#ffffff')).toBe('#0a0b0c');
  });
});
