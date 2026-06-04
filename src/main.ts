/**
 * BG Eraser — UI orchestration.
 *
 * Wires the drop zone / clipboard / file picker to the inference worker, drives
 * the progress + comparison-slider UI, and handles the download actions.
 * All heavy compute runs in the worker; this thread only does DOM + canvas.
 */

import './style.css';
import { resolveBackend } from './lib/backend';
import { derivedFilename, isAcceptedImage } from './lib/filename';
import { hexToRgb, featherRgbaAlpha, MAX_FEATHER_RADIUS, WHITE } from './lib/image-utils';
import {
  canCopyImages,
  copyCanvasToClipboard,
  cutoutOnColor,
  cutoutToCanvas,
  downloadCanvas,
  fileToBitmap,
  type Cutout,
} from './lib/canvas';
import { loadBgColor, saveBgColor, loadFeather, saveFeather } from './lib/storage';
import { SAMPLE_FILENAME, sampleImageBlob } from './lib/sample';
import type { WorkerRequest, WorkerResponse } from './lib/messages';

// ---------------------------------------------------------------------------
// DOM lookups
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

const dropZone = $('#drop-zone');
const fileInput = $<HTMLInputElement>('#file-input');
const statusBar = $('#status');
const backendBadge = $('#backend-badge');
const stage = $('#stage');
const dlProgressWrap = $('#download-progress');
const dlBar = $<HTMLDivElement>('#download-bar');
const dlText = $('#download-text');
const spinner = $('#spinner');
const compare = $('#compare');
const beforeImg = $<HTMLImageElement>('#before-img');
const afterCanvasWrap = $('#after-wrap');
const sliderHandle = $('#slider-handle');
const sliderClip = $<HTMLDivElement>('#after-clip');
const downloadsPanel = $('#downloads');
const btnPng = $<HTMLButtonElement>('#dl-png');
const btnCopy = $<HTMLButtonElement>('#copy-png');
const btnWhite = $<HTMLButtonElement>('#dl-white');
const btnColor = $<HTMLButtonElement>('#dl-color');
const colorPicker = $<HTMLInputElement>('#bg-color');
const resetBtn = $<HTMLButtonElement>('#reset');
const trySampleBtn = $<HTMLButtonElement>('#try-sample');
const featherControl = $('#feather-control');
const featherSlider = $<HTMLInputElement>('#feather');
const featherValue = $('#feather-value');

// Restore the last-used "On color" export background (if any).
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
colorPicker.value = loadBgColor(storage, colorPicker.value);
colorPicker.addEventListener('change', () => saveBgColor(storage, colorPicker.value));

// Restore the last-used edge-feather radius (if any).
featherSlider.max = String(MAX_FEATHER_RADIUS);
let featherRadius = loadFeather(storage, MAX_FEATHER_RADIUS, 0);
featherSlider.value = String(featherRadius);

// "Copy PNG" only appears where the browser can actually copy image blobs.
if (!canCopyImages()) {
  btnCopy.remove();
} else {
  btnCopy.hidden = false;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let worker: Worker | null = null;
let modelReady = false;
let currentCutout: Cutout | null = null;
let currentName = 'image';
let jobId = 0;
let busy = false;

function setStatus(text: string, kind: 'info' | 'error' | 'ok' = 'info') {
  statusBar.textContent = text;
  statusBar.dataset.kind = kind;
}

/**
 * The cut-out actually shown and exported: the raw model result with its alpha
 * channel feathered by the current radius. Radius 0 is a no-op copy, so all
 * outputs (preview / PNG / on-color / on-white) share one source of truth.
 */
function displayCutout(): Cutout | null {
  if (!currentCutout) return null;
  return {
    rgba: featherRgbaAlpha(
      currentCutout.rgba,
      currentCutout.width,
      currentCutout.height,
      featherRadius,
    ),
    width: currentCutout.width,
    height: currentCutout.height,
  };
}

function updateFeatherLabel() {
  featherValue.innerHTML = `${featherRadius}&nbsp;px`;
}

/** Re-render the preview canvas from the current cut-out + feather radius. */
function refreshPreview() {
  const cutout = displayCutout();
  if (!cutout) return;
  const canvas = cutoutToCanvas(cutout);
  canvas.id = 'after-canvas';
  afterCanvasWrap.innerHTML = '';
  afterCanvasWrap.appendChild(canvas);
}

// ---------------------------------------------------------------------------
// Worker bootstrap
// ---------------------------------------------------------------------------
async function ensureWorker(): Promise<Worker> {
  if (worker) return worker;
  const backend = await resolveBackend(navigator as unknown as Parameters<typeof resolveBackend>[0]);
  backendBadge.textContent = backend === 'webgpu' ? 'WebGPU' : 'WASM';
  backendBadge.dataset.backend = backend;

  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) =>
    onWorkerMessage(e.data),
  );
  worker.addEventListener('error', (e) => {
    setStatus(`Worker error: ${e.message}`, 'error');
    spinner.hidden = true;
    busy = false;
  });

  const req: WorkerRequest = { type: 'init', backend };
  worker.postMessage(req);
  setStatus('Loading AI model (one-time download, then cached)…');
  dlProgressWrap.hidden = false;
  return worker;
}

const fileProgress = new Map<string, number>();

function onWorkerMessage(msg: WorkerResponse) {
  switch (msg.type) {
    case 'download': {
      fileProgress.set(msg.file, msg.progress);
      const vals = [...fileProgress.values()];
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      dlBar.style.width = `${avg.toFixed(1)}%`;
      dlText.textContent = `Downloading model — ${avg.toFixed(0)}%`;
      break;
    }
    case 'ready': {
      modelReady = true;
      dlProgressWrap.hidden = true;
      setStatus('Model ready. Drop an image to remove its background.', 'ok');
      break;
    }
    case 'result': {
      busy = false;
      spinner.hidden = true;
      currentCutout = {
        rgba: new Uint8ClampedArray(msg.rgba),
        width: msg.width,
        height: msg.height,
      };
      renderResult();
      setStatus('Done. Drag the slider to compare, then download.', 'ok');
      break;
    }
    case 'error': {
      busy = false;
      spinner.hidden = true;
      dlProgressWrap.hidden = true;
      setStatus(msg.message, 'error');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
async function handleFile(file: File | Blob, name?: string) {
  const fileLike = { type: file.type, name: name ?? (file as File).name };
  if (!isAcceptedImage(fileLike)) {
    setStatus(
      'Unsupported file. Please use a PNG, JPEG, WebP, GIF, BMP or AVIF image.',
      'error',
    );
    return;
  }
  if (busy) {
    setStatus('Still working on the previous image — one moment…');
    return;
  }

  currentName = (fileLike.name && fileLike.name.trim()) || 'image';

  try {
    busy = true;
    await ensureWorker();

    // Show the original immediately.
    const objectUrl = URL.createObjectURL(file);
    beforeImg.src = objectUrl;
    stage.hidden = false;
    compare.hidden = true;
    downloadsPanel.hidden = true;

    if (!modelReady) {
      setStatus('Finishing model download, then processing…');
    } else {
      setStatus('Removing background…');
    }
    spinner.hidden = false;

    const bitmap = await fileToBitmap(file);
    const id = ++jobId;
    const req: WorkerRequest = { type: 'process', id, bitmap };
    (await ensureWorker()).postMessage(req, [bitmap]);
  } catch (err) {
    busy = false;
    spinner.hidden = true;
    setStatus(
      `Could not read that image: ${err instanceof Error ? err.message : String(err)}`,
      'error',
    );
  }
}

function renderResult() {
  refreshPreview();
  compare.hidden = false;
  downloadsPanel.hidden = false;
  featherControl.hidden = false;
  updateFeatherLabel();
  setSlider(50);
  spinner.hidden = true;
}

// ---------------------------------------------------------------------------
// Comparison slider
// ---------------------------------------------------------------------------
function setSlider(percent: number) {
  const p = Math.max(0, Math.min(100, percent));
  // Reveal the "after" (cut-out) from the right side.
  sliderClip.style.clipPath = `inset(0 0 0 ${p}%)`;
  sliderHandle.style.left = `${p}%`;
}

function bindSlider() {
  let dragging = false;
  const update = (clientX: number) => {
    const rect = compare.getBoundingClientRect();
    setSlider(((clientX - rect.left) / rect.width) * 100);
  };
  const down = (e: PointerEvent) => {
    dragging = true;
    compare.setPointerCapture(e.pointerId);
    update(e.clientX);
  };
  const move = (e: PointerEvent) => dragging && update(e.clientX);
  const up = () => (dragging = false);
  compare.addEventListener('pointerdown', down);
  compare.addEventListener('pointermove', move);
  compare.addEventListener('pointerup', up);
  compare.addEventListener('pointercancel', up);
  // Keyboard accessibility on the handle.
  sliderHandle.tabIndex = 0;
  sliderHandle.setAttribute('role', 'slider');
  sliderHandle.setAttribute('aria-label', 'Before/after comparison');
  let current = 50;
  sliderHandle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') current -= 2;
    else if (e.key === 'ArrowRight') current += 2;
    else return;
    e.preventDefault();
    current = Math.max(0, Math.min(100, current));
    setSlider(current);
  });
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------
btnPng.addEventListener('click', () => {
  const cutout = displayCutout();
  if (!cutout) return;
  downloadCanvas(cutoutToCanvas(cutout), derivedFilename(currentName, 'nobg'));
});
btnCopy.addEventListener('click', async () => {
  const cutout = displayCutout();
  if (!cutout) return;
  const original = btnCopy.textContent;
  try {
    await copyCanvasToClipboard(cutoutToCanvas(cutout));
    btnCopy.textContent = '✓ Copied!';
    setStatus('Transparent PNG copied to clipboard.', 'ok');
  } catch (err) {
    setStatus(
      `Copy failed: ${err instanceof Error ? err.message : String(err)}`,
      'error',
    );
  } finally {
    setTimeout(() => {
      btnCopy.textContent = original;
    }, 1500);
  }
});
btnWhite.addEventListener('click', () => {
  const cutout = displayCutout();
  if (!cutout) return;
  downloadCanvas(
    cutoutOnColor(cutout, WHITE),
    derivedFilename(currentName, 'white'),
  );
});
btnColor.addEventListener('click', () => {
  const cutout = displayCutout();
  if (!cutout) return;
  const rgb = hexToRgb(colorPicker.value);
  downloadCanvas(
    cutoutOnColor(cutout, rgb),
    derivedFilename(currentName, 'bg'),
  );
});

// Edge feather: re-composite the existing mask instantly on every change.
featherSlider.addEventListener('input', () => {
  featherRadius = Math.max(
    0,
    Math.min(MAX_FEATHER_RADIUS, Math.round(Number(featherSlider.value) || 0)),
  );
  updateFeatherLabel();
  refreshPreview();
});
featherSlider.addEventListener('change', () => {
  saveFeather(storage, featherRadius, MAX_FEATHER_RADIUS);
});

resetBtn.addEventListener('click', () => {
  currentCutout = null;
  stage.hidden = true;
  compare.hidden = true;
  downloadsPanel.hidden = true;
  featherControl.hidden = true;
  fileInput.value = '';
  setStatus(
    modelReady
      ? 'Model ready. Drop an image to remove its background.'
      : 'Drop an image to begin.',
    'ok',
  );
});

// ---------------------------------------------------------------------------
// Input sources: drag-drop, picker, clipboard
// ---------------------------------------------------------------------------
function bindInputs() {
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) handleFile(f);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  for (const evt of ['dragenter', 'dragover'] as const) {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  }
  for (const evt of ['dragleave', 'drop'] as const) {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  }
  dropZone.addEventListener('drop', (e) => {
    const dt = (e as DragEvent).dataTransfer;
    const f = dt?.files?.[0];
    if (f) handleFile(f);
  });

  // Built-in sample image: try the tool instantly without your own photo.
  trySampleBtn.addEventListener('click', async () => {
    if (busy) return;
    try {
      const blob = await sampleImageBlob();
      await handleFile(blob, SAMPLE_FILENAME);
    } catch (err) {
      setStatus(
        `Could not load the sample image: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    }
  });

  // Paste from clipboard anywhere on the page.
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          handleFile(f, `pasted-image.${item.type.split('/')[1] ?? 'png'}`);
          break;
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
bindInputs();
bindSlider();
setStatus('Drop, paste, or pick an image to begin.');
// Warm up backend detection (and show the badge) without forcing a download
// until the user actually provides an image — keeps first paint fast.
resolveBackend(navigator as unknown as Parameters<typeof resolveBackend>[0]).then((b) => {
  backendBadge.textContent = b === 'webgpu' ? 'WebGPU' : 'WASM';
  backendBadge.dataset.backend = b;
});
