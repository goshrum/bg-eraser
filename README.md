# BG Eraser

**An in-browser AI background remover. 100% on-device · no upload · no API key · free.**

Drop a photo and an AI model running **entirely in your browser** removes the
background, giving you a transparent PNG to download. Your image is **never
uploaded** — all the compute happens on your device. The only thing fetched
over the network is the model's weights, downloaded **once** from the free,
keyless HuggingFace CDN and then cached by your browser.

---

## Why it's different

- **Private by design.** The photo stays on your machine. There is no backend of
  ours, no server, no third-party API, no account, no key.
- **Free.** Hostable as a static site on GitHub Pages. No paid services.
- **Fast after the first run.** The model (~tens of MB) downloads once and is
  cached by the browser, so subsequent uses are instant and work offline.

## How it works

1. You provide an image (drag-drop, file picker, or paste from clipboard).
2. The image is decoded to pixels on a canvas and handed to a **Web Worker**
   so the UI stays responsive.
3. The worker runs **[briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4)**
   via **[🤗 transformers.js](https://github.com/huggingface/transformers.js)**
   (`@huggingface/transformers` v4) using the documented background-removal
   recipe: `AutoModel` + `AutoProcessor` + `RawImage`.
4. The model outputs a single-channel foreground **mask**, which is resized back
   to the original resolution and composited into the image's **alpha channel**.
5. You get a before/after comparison slider and can **download** the cut-out as a
   transparent PNG, on white, or on a custom solid color — or **copy** the
   transparent PNG straight to your clipboard. Your last-used "On color"
   background is remembered for next time.

No photo handy? Click **Try a sample image** to run the full pipeline instantly
on a locally-generated sample — still nothing leaves your device.

### The only network call

The single network request is the **model-weights download from the HuggingFace
CDN** (`https://huggingface.co/...`). This is free and requires no API key. After
the first successful load, transformers.js serves the weights from the browser
cache.

### Model

- **briaai/RMBG-1.4** — a high-quality general-purpose background-removal /
  salient-object segmentation model. Wired exactly per the transformers.js docs.
- If you prefer portrait matting, `Xenova/modnet` is a drop-in alternative; this
  project ships with RMBG-1.4 because its wiring is the documented, robust path.

## Backends: WebGPU with WASM fallback

On load the app calls `navigator.gpu.requestAdapter()`. If a WebGPU adapter is
available it runs on the GPU (much faster); otherwise it falls back to
single-threaded **WASM**. The active backend is shown in a badge in the header.

## Run locally

```bash
npm install
npm run dev      # start Vite dev server
npm run build    # type-check + production build to ./dist
npm run preview  # preview the production build
npm test         # run the Vitest unit suite
npm run smoke    # OPTIONAL: attempt a Node model load (see below)
```

## Deploy to GitHub Pages

1. Push this repo to GitHub with the default branch `main`.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) runs the tests, builds
   the site, and deploys `dist/` to Pages on every push to `main`.

Vite's `base` is set to `'./'` so the build works from any Pages sub-path.

## Testing

- **Unit tests (Vitest):** cover all the pure, non-AI logic — alpha-mask
  compositing onto RGBA, flattening an alpha image onto a solid background, hex
  parsing, output-filename derivation, image file-type validation, the
  (mockable) WebGPU-availability guard, background-color persistence, and the
  sample-image SVG/data-URL builder.
- **Node smoke test (`npm run smoke`):** *attempts* to actually load RMBG-1.4
  and run it on a tiny synthetic image to prove the pipeline wiring. It has a
  hard timeout and **skips gracefully** (exit 0) if the model download is too
  slow or Node/onnx can't run it — it never hangs and never fails CI. See the
  honest caveat below.

## Limitations (honest)

- **Runtime verification.** The browser/WebGPU path cannot be executed in a
  headless CI box. Correctness here rests on: (a) following the official
  transformers.js API, (b) full unit tests of the pure logic, and (c) the
  best-effort Node smoke test. **Real GPU/WASM inference is verified in a
  browser**, not in this repo's automated checks.
- **COOP/COEP / threads.** Multi-threaded WASM (via `SharedArrayBuffer`)
  requires the page to be *cross-origin isolated*, which needs the
  `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` response
  headers. **GitHub Pages cannot set custom headers**, so this app does **not**
  rely on threads. Single-threaded WASM and WebGPU both work fine without those
  headers — that's the default config. (The Vite dev/preview servers do send the
  headers locally if you want to experiment with threads.)
- **Quality depends on the model.** RMBG-1.4 is excellent on people, products,
  and clear subjects, but fine hair, glass, and busy/low-contrast scenes can
  produce imperfect edges. This is a model limitation, not a bug.
- **First run downloads weights.** The initial model download is tens of MB; it
  is cached afterwards.

## License

MIT — see [LICENSE](./LICENSE). © 2026 georgerum07.
