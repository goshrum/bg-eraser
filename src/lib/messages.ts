/**
 * Message protocol shared between the UI thread and the inference Web Worker.
 */

import type { Backend } from './backend';

export const MODEL_ID = 'briaai/RMBG-1.4';

/** Messages sent from UI -> worker. */
export type WorkerRequest =
  | { type: 'init'; backend: Backend }
  | { type: 'process'; id: number; bitmap: ImageBitmap };

/** Messages sent from worker -> UI. */
export type WorkerResponse =
  | { type: 'download'; status: 'progress'; file: string; progress: number; loaded: number; total: number }
  | { type: 'ready'; backend: Backend }
  | { type: 'result'; id: number; rgba: ArrayBuffer; width: number; height: number }
  | { type: 'error'; id?: number; message: string };
