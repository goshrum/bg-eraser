/**
 * Pure helpers for deriving output filenames and validating input files.
 */

/**
 * Derive an output filename from an input filename and a suffix.
 *
 * `derivedFilename("cat.jpg", "nobg")            => "cat-nobg.png"`
 * `derivedFilename("my.photo.JPEG", "white")     => "my.photo-white.png"`
 * `derivedFilename("noext", "nobg")              => "noext-nobg.png"`
 * `derivedFilename("", "nobg")                   => "image-nobg.png"`
 *
 * The output is always a `.png` (we only ever export PNG to preserve alpha).
 */
export function derivedFilename(
  inputName: string,
  suffix: string,
  ext = 'png',
): string {
  const trimmed = (inputName ?? '').trim();
  // Strip any directory components defensively.
  const base = trimmed.split(/[\\/]/).pop() ?? '';
  // Remove the final extension (only the last dot segment).
  const dot = base.lastIndexOf('.');
  let stem = dot > 0 ? base.slice(0, dot) : base;
  stem = stem.trim();
  if (!stem) stem = 'image';
  // Sanitise: collapse whitespace, drop characters illegal on common FS.
  stem = stem.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
  if (!stem) stem = 'image';
  return `${stem}-${suffix}.${ext}`;
}

/** Image MIME types we accept. */
export const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
] as const;

/**
 * Validate that a File-like object is an accepted image.
 *
 * Accepts anything with a recognised image/* MIME type, or — when the MIME
 * type is missing/blank (some drag sources) — a recognised image extension.
 */
export function isAcceptedImage(file: {
  type?: string;
  name?: string;
}): boolean {
  const type = (file.type ?? '').toLowerCase();
  if (type.startsWith('image/')) {
    // Reject obviously non-raster image types we can't decode in canvas reliably.
    if (type === 'image/svg+xml') return false;
    return true;
  }
  // Fallback to extension sniffing when type is absent.
  const name = (file.name ?? '').toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|avif)$/.test(name);
}
