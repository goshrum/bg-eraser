/**
 * Built-in sample image so first-time visitors can try the tool instantly
 * without supplying their own photo.
 *
 * The image is generated as an SVG (a clear, high-contrast subject on a plain
 * background — exactly the kind of scene RMBG-1.4 segments well) and exposed as
 * a data URL. `buildSampleSvg` is pure and unit-tested; `sampleImageDataUrl`
 * and `sampleImageBlob` are thin browser conveniences built on top of it.
 */

export const SAMPLE_FILENAME = 'sample.png';

/**
 * Build the sample image as an SVG string.
 *
 * A friendly rounded "mascot" subject (head + body + simple face) sits on a
 * soft solid background. High subject/background contrast makes for a clean,
 * obvious cut-out demo.
 */
export function buildSampleSvg(size = 512): string {
  const s = size;
  const cx = s / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#cfd8ea"/>
  <ellipse cx="${cx}" cy="${s * 0.92}" rx="${s * 0.34}" ry="${s * 0.05}" fill="#aab6d0"/>
  <rect x="${s * 0.3}" y="${s * 0.46}" width="${s * 0.4}" height="${s * 0.4}" rx="${s * 0.12}" fill="#f97316"/>
  <circle cx="${cx}" cy="${s * 0.34}" r="${s * 0.2}" fill="#fb923c"/>
  <circle cx="${cx - s * 0.07}" cy="${s * 0.32}" r="${s * 0.028}" fill="#1f2937"/>
  <circle cx="${cx + s * 0.07}" cy="${s * 0.32}" r="${s * 0.028}" fill="#1f2937"/>
  <path d="M ${cx - s * 0.06} ${s * 0.4} Q ${cx} ${s * 0.45} ${cx + s * 0.06} ${s * 0.4}" stroke="#1f2937" stroke-width="${s * 0.012}" fill="none" stroke-linecap="round"/>
</svg>`;
}

/** UTF-8-safe base64 encoding of an ASCII/Latin SVG string for a data URL. */
function svgToBase64(svg: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(svg)));
  }
  // Node fallback (used only in tests/SSR).
  return Buffer.from(svg, 'utf-8').toString('base64');
}

/** The sample image as a self-contained SVG data URL. */
export function sampleImageDataUrl(size = 512): string {
  return `data:image/svg+xml;base64,${svgToBase64(buildSampleSvg(size))}`;
}

/**
 * Rasterize the sample SVG to a PNG Blob (browser only).
 *
 * We rasterize to PNG rather than handing the SVG straight to the pipeline
 * because the image decode path intentionally rejects `image/svg+xml`.
 */
export async function sampleImageBlob(size = 512): Promise<Blob> {
  const url = sampleImageDataUrl(size);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not load the sample image.'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a canvas for the sample image.');
  ctx.drawImage(img, 0, 0, size, size);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Sample image export failed.'))),
      'image/png',
    ),
  );
}
