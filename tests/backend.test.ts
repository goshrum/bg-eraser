import { describe, it, expect, vi } from 'vitest';
import { detectBackend, resolveBackend } from '../src/lib/backend';

describe('detectBackend', () => {
  it('returns webgpu when navigator.gpu exists', () => {
    expect(detectBackend({ gpu: {} })).toBe('webgpu');
  });
  it('returns wasm when gpu is missing', () => {
    expect(detectBackend({})).toBe('wasm');
  });
  it('returns wasm when gpu is falsy', () => {
    expect(detectBackend({ gpu: undefined })).toBe('wasm');
  });
  it('returns wasm for null/undefined navigator', () => {
    expect(detectBackend(null)).toBe('wasm');
    expect(detectBackend(undefined)).toBe('wasm');
  });
});

describe('resolveBackend', () => {
  it('falls back to wasm when there is no gpu', async () => {
    expect(await resolveBackend({})).toBe('wasm');
  });

  it('returns webgpu when an adapter is granted', async () => {
    const requestAdapter = vi.fn().mockResolvedValue({ name: 'fake-adapter' });
    expect(await resolveBackend({ gpu: { requestAdapter } })).toBe('webgpu');
    expect(requestAdapter).toHaveBeenCalledOnce();
  });

  it('falls back to wasm when no adapter is returned', async () => {
    const requestAdapter = vi.fn().mockResolvedValue(null);
    expect(await resolveBackend({ gpu: { requestAdapter } })).toBe('wasm');
  });

  it('falls back to wasm when requestAdapter throws', async () => {
    const requestAdapter = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await resolveBackend({ gpu: { requestAdapter } })).toBe('wasm');
  });
});
