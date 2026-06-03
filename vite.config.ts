import { defineConfig } from 'vite';

// Base './' so the production build works on GitHub Pages from any sub-path.
//
// NOTE on cross-origin isolation (COOP/COEP):
// Multi-threaded WASM (SharedArrayBuffer) requires the page to be cross-origin
// isolated, which needs the COOP/COEP response headers. GitHub Pages cannot set
// custom response headers, so we DO NOT depend on threads. transformers.js runs
// fine single-threaded on WASM, and WebGPU does not require COOP/COEP either.
// During local `vite dev`/`preview` we *can* send the headers (helps if you want
// to experiment with threads locally), but the app never requires them.
export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // transformers.js ships its own onnxruntime-web; let Vite pre-bundle it.
    exclude: [],
  },
});
