import { describe, it, expect } from 'vitest';
import {
  buildSampleSvg,
  sampleImageDataUrl,
  SAMPLE_FILENAME,
} from '../src/lib/sample';

describe('buildSampleSvg', () => {
  it('produces a well-formed SVG with the requested dimensions', () => {
    const svg = buildSampleSvg(256);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('width="256"');
    expect(svg).toContain('height="256"');
    expect(svg).toContain('viewBox="0 0 256 256"');
  });

  it('defaults to a 512px canvas', () => {
    expect(buildSampleSvg()).toContain('viewBox="0 0 512 512"');
  });

  it('contains a distinct subject and background (so there is something to cut out)', () => {
    const svg = buildSampleSvg();
    // background fill + subject fills present.
    expect(svg).toContain('#cfd8ea'); // background
    expect(svg).toContain('#fb923c'); // subject head
  });

  it('has balanced angle brackets (no obviously broken markup)', () => {
    const svg = buildSampleSvg();
    const opens = (svg.match(/</g) ?? []).length;
    const closes = (svg.match(/>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});

describe('sampleImageDataUrl', () => {
  it('is a base64 SVG data URL that decodes back to the SVG', () => {
    const url = sampleImageDataUrl(128);
    const prefix = 'data:image/svg+xml;base64,';
    expect(url.startsWith(prefix)).toBe(true);
    const decoded = Buffer.from(url.slice(prefix.length), 'base64').toString(
      'utf-8',
    );
    expect(decoded).toBe(buildSampleSvg(128));
  });
});

describe('SAMPLE_FILENAME', () => {
  it('is a .png so the derived download name stays sensible', () => {
    expect(SAMPLE_FILENAME.endsWith('.png')).toBe(true);
  });
});
