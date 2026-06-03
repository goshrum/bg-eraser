/**
 * Browser-only canvas helpers (DOM dependent — not unit tested in Node).
 * Kept thin; the math lives in the pure `image-utils` module.
 */

import { flattenOntoBackground, type RGB } from './image-utils';

export interface Cutout {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Build a canvas containing the transparent cut-out. */
export function cutoutToCanvas(cutout: Cutout): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cutout.width;
  canvas.height = cutout.height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cutout.width, cutout.height);
  imageData.data.set(cutout.rgba);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Build a canvas with the cut-out flattened onto a solid colour. */
export function cutoutOnColor(cutout: Cutout, bg: RGB): HTMLCanvasElement {
  const flat = flattenOntoBackground(cutout.rgba, bg);
  const canvas = document.createElement('canvas');
  canvas.width = cutout.width;
  canvas.height = cutout.height;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(cutout.width, cutout.height);
  imageData.data.set(flat);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** Export a canvas to a PNG Blob and trigger a download. */
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<void> {
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas export failed.'))),
      'image/png',
    ),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been processed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Render a canvas to a PNG Blob. */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas export failed.'))),
      'image/png',
    ),
  );
}

/** Whether the async Clipboard API can accept image blobs in this browser. */
export function canCopyImages(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  );
}

/** Copy a canvas to the clipboard as a PNG image. */
export async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement,
): Promise<void> {
  if (!canCopyImages()) {
    throw new Error('Clipboard image copy is not supported in this browser.');
  }
  const blob = await canvasToPngBlob(canvas);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** Decode a File/Blob into an ImageBitmap (used to feed the worker). */
export async function fileToBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}
