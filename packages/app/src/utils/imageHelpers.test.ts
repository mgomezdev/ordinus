import { describe, it, expect } from 'vitest';
import { getRotatedPerspectiveUrl } from './imageHelpers';
import type { Rotation } from '../types/gridfinity';

describe('getRotatedPerspectiveUrl', () => {
  it('should return original URL for 0° rotation', () => {
    const url = '/libraries/bins_standard/bin_1x1-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 0)).toBe(url);
  });

  it('should append -90 for 90° rotation', () => {
    const url = '/libraries/bins_standard/bin_1x1-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 90)).toBe(
      '/libraries/bins_standard/bin_1x1-perspective-90.png'
    );
  });

  it('should append -180 for 180° rotation', () => {
    const url = '/libraries/bins_standard/bin_1x1-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 180)).toBe(
      '/libraries/bins_standard/bin_1x1-perspective-180.png'
    );
  });

  it('should append -270 for 270° rotation', () => {
    const url = '/libraries/bins_standard/bin_1x1-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 270)).toBe(
      '/libraries/bins_standard/bin_1x1-perspective-270.png'
    );
  });

  it('should work with resolved absolute URLs', () => {
    const url = '/libraries/bins_standard/bin_1x1-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 90)).toBe(
      '/libraries/bins_standard/bin_1x1-perspective-90.png'
    );
  });

  it('should work with relative filenames (no leading slash)', () => {
    const url = 'bin_1x1-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 90)).toBe('bin_1x1-perspective-90.png');
    expect(getRotatedPerspectiveUrl(url, 180)).toBe('bin_1x1-perspective-180.png');
    expect(getRotatedPerspectiveUrl(url, 270)).toBe('bin_1x1-perspective-270.png');
  });

  it('should handle URLs without -perspective pattern and return original', () => {
    const url = '/libraries/bins_standard/bin_1x1-ortho.png';
    expect(getRotatedPerspectiveUrl(url, 90)).toBe(url);
  });

  it('should return empty string unchanged', () => {
    expect(getRotatedPerspectiveUrl('', 0 as Rotation)).toBe('');
    expect(getRotatedPerspectiveUrl('', 90 as Rotation)).toBe('');
  });

  it('should only replace -perspective.png in filename, not in a directory path segment', () => {
    // The directory contains "-perspective" but should only replace the filename part
    const url = '/libraries/bins-perspective/bin_1x1-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 90)).toBe(
      '/libraries/bins-perspective/bin_1x1-perspective-90.png'
    );
  });

  it('should handle multi-size bin URLs with 90° rotation', () => {
    const url = '/libraries/bins_standard/bin_3x2-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 90)).toBe(
      '/libraries/bins_standard/bin_3x2-perspective-90.png'
    );
  });

  it('should handle multi-size bin URLs with 270° rotation', () => {
    const url = '/libraries/bins_labeled/bin_5x4_labeled-perspective.png';
    expect(getRotatedPerspectiveUrl(url, 270)).toBe(
      '/libraries/bins_labeled/bin_5x4_labeled-perspective-270.png'
    );
  });
});
