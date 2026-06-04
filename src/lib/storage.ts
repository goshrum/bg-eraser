/**
 * Pure helpers for persisting small user preferences (e.g. the last-used
 * export background color) in localStorage.
 *
 * The functions take a Storage-like object so they can be unit-tested in Node
 * with a tiny in-memory stub, and they never throw — storage access can fail in
 * private-browsing modes, so every call is defensively guarded.
 */

/** Storage key for the last-used "On color" export background. */
export const BG_COLOR_KEY = 'bg-eraser:bg-color';

/** Storage key for the last-used edge-feather radius (pixels). */
export const FEATHER_KEY = 'bg-eraser:feather';

/** A minimal subset of the Web Storage API we depend on. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Whether a string is a valid #rrggbb hex color (what <input type=color> emits). */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Read the saved background color. Returns `fallback` when nothing valid is
 * stored, or when storage access throws (private mode / disabled cookies).
 */
export function loadBgColor(
  storage: StorageLike | null | undefined,
  fallback: string,
): string {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(BG_COLOR_KEY);
    return isHexColor(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persist the background color. Invalid colors are ignored (we never write
 * garbage), and any storage error is swallowed. Returns whether a write
 * actually happened.
 */
export function saveBgColor(
  storage: StorageLike | null | undefined,
  value: string,
): boolean {
  if (!storage || !isHexColor(value)) return false;
  try {
    storage.setItem(BG_COLOR_KEY, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clamp an arbitrary value to an integer feather radius in [0, max].
 * Non-finite or non-numeric input collapses to 0.
 */
export function clampFeather(value: unknown, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

/**
 * Read the saved feather radius, clamped to [0, max]. Returns `fallback`
 * (also clamped) when nothing valid is stored or storage access throws.
 */
export function loadFeather(
  storage: StorageLike | null | undefined,
  max: number,
  fallback = 0,
): number {
  const fb = clampFeather(fallback, max);
  if (!storage) return fb;
  try {
    const raw = storage.getItem(FEATHER_KEY);
    if (raw === null) return fb;
    const n = Number(raw);
    return Number.isFinite(n) ? clampFeather(n, max) : fb;
  } catch {
    return fb;
  }
}

/**
 * Persist the feather radius (clamped to [0, max]). Any storage error is
 * swallowed. Returns whether a write actually happened.
 */
export function saveFeather(
  storage: StorageLike | null | undefined,
  value: number,
  max: number,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(FEATHER_KEY, String(clampFeather(value, max)));
    return true;
  } catch {
    return false;
  }
}
