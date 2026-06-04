import { describe, it, expect } from 'vitest';
import {
  BG_COLOR_KEY,
  FEATHER_KEY,
  TRIM_KEY,
  clampFeather,
  isHexColor,
  loadBgColor,
  loadFeather,
  loadTrim,
  saveBgColor,
  saveFeather,
  saveTrim,
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

describe('clampFeather', () => {
  it('clamps to [0, max] and rounds', () => {
    expect(clampFeather(2.4, 5)).toBe(2);
    expect(clampFeather(2.6, 5)).toBe(3);
    expect(clampFeather(-3, 5)).toBe(0);
    expect(clampFeather(99, 5)).toBe(5);
  });
  it('parses numeric strings and rejects garbage', () => {
    expect(clampFeather('3', 5)).toBe(3);
    expect(clampFeather('nope', 5)).toBe(0);
    expect(clampFeather(NaN, 5)).toBe(0);
    expect(clampFeather(Infinity, 5)).toBe(0);
  });
});

describe('loadFeather', () => {
  it('returns the stored value, clamped', () => {
    expect(loadFeather(memStorage({ [FEATHER_KEY]: '3' }), 5)).toBe(3);
    expect(loadFeather(memStorage({ [FEATHER_KEY]: '42' }), 5)).toBe(5);
  });
  it('returns the (clamped) fallback when nothing is stored', () => {
    expect(loadFeather(memStorage(), 5, 2)).toBe(2);
    expect(loadFeather(memStorage(), 5)).toBe(0);
  });
  it('returns the fallback when the stored value is non-numeric', () => {
    expect(loadFeather(memStorage({ [FEATHER_KEY]: 'x' }), 5, 1)).toBe(1);
  });
  it('returns the fallback for null storage and on access errors', () => {
    expect(loadFeather(null, 5, 4)).toBe(4);
    expect(loadFeather(throwingStorage, 5, 4)).toBe(4);
  });
});

describe('saveFeather', () => {
  it('writes a clamped value and reports success', () => {
    const s = memStorage();
    expect(saveFeather(s, 3, 5)).toBe(true);
    expect(s.store[FEATHER_KEY]).toBe('3');
    saveFeather(s, 99, 5);
    expect(s.store[FEATHER_KEY]).toBe('5');
  });
  it('returns false for null storage and on access errors', () => {
    expect(saveFeather(null, 3, 5)).toBe(false);
    expect(saveFeather(throwingStorage, 3, 5)).toBe(false);
  });
  it('round-trips through load', () => {
    const s = memStorage();
    saveFeather(s, 4, 5);
    expect(loadFeather(s, 5, 0)).toBe(4);
  });
});

describe('loadTrim', () => {
  it("reads '1' as true and '0' as false", () => {
    expect(loadTrim(memStorage({ [TRIM_KEY]: '1' }))).toBe(true);
    expect(loadTrim(memStorage({ [TRIM_KEY]: '0' }))).toBe(false);
  });
  it('returns the fallback when nothing valid is stored', () => {
    expect(loadTrim(memStorage(), true)).toBe(true);
    expect(loadTrim(memStorage(), false)).toBe(false);
    expect(loadTrim(memStorage({ [TRIM_KEY]: 'maybe' }), true)).toBe(true);
  });
  it('defaults to false when no fallback is given', () => {
    expect(loadTrim(memStorage())).toBe(false);
  });
  it('returns the fallback for null storage and on access errors', () => {
    expect(loadTrim(null, true)).toBe(true);
    expect(loadTrim(throwingStorage, true)).toBe(true);
  });
});

describe('saveTrim', () => {
  it("writes '1'/'0' and reports success", () => {
    const s = memStorage();
    expect(saveTrim(s, true)).toBe(true);
    expect(s.store[TRIM_KEY]).toBe('1');
    saveTrim(s, false);
    expect(s.store[TRIM_KEY]).toBe('0');
  });
  it('returns false for null storage and on access errors', () => {
    expect(saveTrim(null, true)).toBe(false);
    expect(saveTrim(throwingStorage, true)).toBe(false);
  });
  it('round-trips through load', () => {
    const s = memStorage();
    saveTrim(s, true);
    expect(loadTrim(s, false)).toBe(true);
  });
});
