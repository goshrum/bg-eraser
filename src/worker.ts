/// <reference lib="webworker" />
/**
 * Inference Web Worker.
 *
 * Runs the RMBG-1.4 background-removal model entirely on the user's device.
 * The ONLY network access is the one-time download of the model weights from
 * the HuggingFace CDN (keyless, free). The model is cached by the browser, so
 * subsequent runs are offline/instant.
 *
 * Wiring follows the official transformers.js background-removal recipe:
 *   AutoModel.from_pretrained + AutoProcessor.from_pretrained + RawImage,
 * then resize the predicted single-channel mask back to the source size and
 * use it as the alpha channel.
 *   https://huggingface.co/docs/transformers.js  (RMBG-1.4 / image segmentation)
 */

import {
  AutoModel,
  AutoProcessor,
  RawImage,
  env,
  type PreTrainedModel,
  type Processor,
} from '@huggingface/transformers';
import { MODEL_ID, type WorkerRequest, type WorkerResponse } from './lib/messages';
import { applyAlphaMask } from './lib/image-utils';

// We do NOT bundle local models; always fetch from the HF CDN (free, keyless).
env.allowLocalModels = false;

let modelPromise: Promise<{ model: PreTrainedModel; processor: Processor }> | null = null;

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);
}

async function loadModel(backend: 'webgpu' | 'wasm') {
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    const progress_callback = (data: {
      status: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
    }) => {
      if (data.status === 'progress' && data.file) {
        post({
          type: 'download',
          status: 'progress',
          file: data.file,
          progress: data.progress ?? 0,
          loaded: data.loaded ?? 0,
          total: data.total ?? 0,
        });
      }
    };

    // RMBG-1.4 publishes fp32 weights; pick a precision that suits the backend.
    const model = await AutoModel.from_pretrained(MODEL_ID, {
      // WebGPU is happiest with fp32 here; WASM uses quantised for speed/size.
      dtype: backend === 'webgpu' ? 'fp32' : 'q8',
      device: backend,
      progress_callback,
    });
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback,
    });
    return { model, processor };
  })();

  return modelPromise;
}

/**
 * Convert an ImageBitmap into a RawImage by drawing onto an OffscreenCanvas.
 */
function bitmapToRawImage(bitmap: ImageBitmap): { raw: RawImage; rgba: Uint8ClampedArray } {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not acquire 2D canvas context in worker.');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const rgba = imageData.data; // Uint8ClampedArray, RGBA
  // RawImage expects channel-last data; 4 channels (RGBA) is supported.
  const raw = new RawImage(
    new Uint8ClampedArray(rgba), // copy: we mutate the original for output
    bitmap.width,
    bitmap.height,
    4,
  );
  return { raw, rgba };
}

async function process(id: number, bitmap: ImageBitmap) {
  const { model, processor } = await loadModel(
    // backend already configured at init; reuse whatever was loaded.
    (currentBackend ?? 'wasm'),
  );

  const { raw, rgba } = bitmapToRawImage(bitmap);
  bitmap.close();

  // Preprocess -> run model -> postprocess to a 0..1 mask.
  const { pixel_values } = await processor(raw);
  const { output } = await model({ input: pixel_values });

  // `output` is a Tensor [1, 1, H, W] of foreground probabilities in 0..1.
  // Resize the mask back to the original image dimensions and read bytes.
  const maskTensor = output[0].mul(255).to('uint8');
  const maskImage = await RawImage.fromTensor(maskTensor).resize(
    raw.width,
    raw.height,
  );
  const mask = maskImage.data as Uint8Array; // single channel, length W*H

  // Composite mask into the alpha channel of the original pixels.
  applyAlphaMask(rgba, mask);

  // Transfer the buffer back to the UI thread (zero-copy).
  const buffer = rgba.buffer as ArrayBuffer;
  post({ type: 'result', id, rgba: buffer, width: raw.width, height: raw.height }, [
    buffer,
  ]);
}

let currentBackend: 'webgpu' | 'wasm' | null = null;

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    currentBackend = msg.backend;
    loadModel(msg.backend)
      .then(() => post({ type: 'ready', backend: msg.backend }))
      .catch((err) =>
        post({ type: 'error', message: friendlyError(err) }),
      );
  } else if (msg.type === 'process') {
    process(msg.id, msg.bitmap).catch((err) =>
      post({ type: 'error', id: msg.id, message: friendlyError(err) }),
    );
  }
});

function friendlyError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/fetch|network|Failed to load|404|CDN/i.test(m)) {
    return 'Could not download the AI model. Check your internet connection and try again.';
  }
  return `Processing failed: ${m}`;
}
