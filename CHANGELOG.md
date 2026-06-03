# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Copy result to clipboard.** A "Copy PNG" button copies the transparent
  cut-out straight to the system clipboard (PNG). The button only appears in
  browsers that support image writes via the async Clipboard API.
- **Built-in sample image.** A "Try a sample image" link lets first-time
  visitors run the full pipeline instantly without supplying their own photo.
  The sample is generated locally as an SVG and rasterized to PNG — nothing is
  fetched.
- **Remembers your export background color.** The last color used for the
  "On color" export is saved to `localStorage` and restored on the next visit.

### Tests

- Added unit tests for the new pure logic: background-color persistence
  (`storage`) and the sample-image SVG/data-URL builder (`sample`).

## [1.0.0]

### Added

- In-browser AI background removal using
  [briaai/RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) via
  [transformers.js](https://github.com/huggingface/transformers.js), running
  100% on-device with no upload and no API key.
- Image input via drag-and-drop, file picker, and clipboard paste.
- WebGPU inference with an automatic single-threaded WASM fallback, surfaced as
  a backend badge.
- Before/after comparison slider (pointer + keyboard accessible).
- Exports: transparent PNG, flattened on white, and flattened on a custom solid
  color.
- One-time, browser-cached model-weights download from the keyless HuggingFace
  CDN.
- Vitest unit suite for all pure logic and an optional Node smoke test.
- GitHub Actions workflow to build and deploy to GitHub Pages.
