/**
 * Backend (WebGPU vs WASM) detection.
 *
 * Kept as a pure-ish helper that takes the navigator-like object so it can be
 * unit-tested by mocking `navigator.gpu`.
 */

export type Backend = 'webgpu' | 'wasm';

/**
 * Detect whether WebGPU is available given a navigator-like object.
 *
 * This is a *capability* check (the `gpu` adapter API exists). It does not
 * await an actual adapter request — that's done at model-load time. We keep
 * this synchronous and side-effect free so it is trivially testable.
 */
export function detectBackend(
  nav: { gpu?: unknown } | undefined | null,
): Backend {
  if (nav && typeof nav === 'object' && 'gpu' in nav && nav.gpu) {
    return 'webgpu';
  }
  return 'wasm';
}

/**
 * Asynchronously confirm a usable WebGPU adapter can actually be acquired.
 * Returns the chosen backend. Falls back to 'wasm' on any failure.
 */
export async function resolveBackend(
  nav: { gpu?: { requestAdapter?: () => Promise<unknown> } } | undefined | null,
): Promise<Backend> {
  if (detectBackend(nav) !== 'webgpu') return 'wasm';
  try {
    const adapter = await nav!.gpu!.requestAdapter!();
    return adapter ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}
