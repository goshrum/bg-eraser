import { describe, it, expect } from 'vitest';
import { derivedFilename, isAcceptedImage } from '../src/lib/filename';

describe('derivedFilename', () => {
  it('replaces a simple extension and appends the suffix', () => {
    expect(derivedFilename('cat.jpg', 'nobg')).toBe('cat-nobg.png');
  });
  it('only strips the final extension on multi-dot names', () => {
    expect(derivedFilename('my.photo.JPEG', 'white')).toBe('my.photo-white.png');
  });
  it('handles names with no extension', () => {
    expect(derivedFilename('noext', 'nobg')).toBe('noext-nobg.png');
  });
  it('falls back to "image" for empty/blank names', () => {
    expect(derivedFilename('', 'nobg')).toBe('image-nobg.png');
    expect(derivedFilename('   ', 'nobg')).toBe('image-nobg.png');
  });
  it('strips directory components', () => {
    expect(derivedFilename('/a/b/photo.png', 'nobg')).toBe('photo-nobg.png');
    expect(derivedFilename('C:\\Users\\me\\pic.webp', 'bg')).toBe('pic-bg.png');
  });
  it('strips filesystem-illegal characters', () => {
    expect(derivedFilename('we:ird?name.png', 'nobg')).toBe('weirdname-nobg.png');
  });
  it('keeps dotfiles sane (leading-dot only)', () => {
    // lastIndexOf('.') === 0 -> treated as no extension, stem stays ".hidden"
    expect(derivedFilename('.hidden', 'nobg')).toBe('.hidden-nobg.png');
  });
  it('always outputs .png', () => {
    expect(derivedFilename('x.gif', 'nobg').endsWith('.png')).toBe(true);
  });
});

describe('isAcceptedImage', () => {
  it('accepts common image mime types', () => {
    expect(isAcceptedImage({ type: 'image/png' })).toBe(true);
    expect(isAcceptedImage({ type: 'image/jpeg' })).toBe(true);
    expect(isAcceptedImage({ type: 'image/webp' })).toBe(true);
    expect(isAcceptedImage({ type: 'image/avif' })).toBe(true);
  });
  it('rejects SVG (not canvas-safe for this pipeline)', () => {
    expect(isAcceptedImage({ type: 'image/svg+xml' })).toBe(false);
  });
  it('rejects non-image mime types', () => {
    expect(isAcceptedImage({ type: 'application/pdf' })).toBe(false);
    expect(isAcceptedImage({ type: 'text/plain', name: 'a.txt' })).toBe(false);
  });
  it('falls back to extension when type is missing', () => {
    expect(isAcceptedImage({ name: 'photo.JPG' })).toBe(true);
    expect(isAcceptedImage({ name: 'pic.heic' })).toBe(false);
    expect(isAcceptedImage({ type: '', name: 'image.png' })).toBe(true);
  });
  it('rejects when neither type nor extension is recognised', () => {
    expect(isAcceptedImage({})).toBe(false);
    expect(isAcceptedImage({ type: '', name: 'data' })).toBe(false);
  });
});
