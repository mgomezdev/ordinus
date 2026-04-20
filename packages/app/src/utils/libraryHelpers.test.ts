import { describe, it, expect } from 'vitest';
import { resolveImagePath, prefixItemId, unprefixItemId } from './libraryHelpers';

describe('libraryHelpers', () => {
  describe('resolveImagePath', () => {
    const basePath = '/libraries/simple-utensils';

    it('should handle undefined imageUrl', () => {
      expect(resolveImagePath(basePath, undefined)).toBeUndefined();
    });

    it('should pass through HTTP URLs unchanged', () => {
      const url = 'http://example.com/image.png';
      expect(resolveImagePath(basePath, url)).toBe(url);
    });

    it('should pass through HTTPS URLs unchanged', () => {
      const url = 'https://example.com/image.png';
      expect(resolveImagePath(basePath, url)).toBe(url);
    });

    it('should pass through already-resolved library paths (backward compat)', () => {
      const url = '/libraries/simple-utensils/Utensils 1x3.png';
      expect(resolveImagePath(basePath, url)).toBe(url);
    });

    it('should reject absolute paths for security', () => {
      const url = '/images/Utensils 1x3.png';
      expect(resolveImagePath(basePath, url)).toBeUndefined();
    });

    it('should resolve simple relative filenames to library root', () => {
      const url = 'Utensils 1x3.png';
      expect(resolveImagePath(basePath, url))
        .toBe('/libraries/simple-utensils/Utensils 1x3.png');
    });

    it('should resolve relative paths with subdirectories', () => {
      const url = 'images/subfolder/Utensils 1x3.png';
      expect(resolveImagePath(basePath, url))
        .toBe('/libraries/simple-utensils/images/subfolder/Utensils 1x3.png');
    });

    it('should handle filenames with spaces', () => {
      const url = 'Utensils offset 2x4.png';
      expect(resolveImagePath(basePath, url))
        .toBe('/libraries/simple-utensils/Utensils offset 2x4.png');
    });

    it('should reject parent directory traversal for security', () => {
      const url = '../../../etc/passwd';
      expect(resolveImagePath(basePath, url)).toBeUndefined();
    });

    it('should reject parent directory traversal in subdirectories', () => {
      const url = 'images/../../../file.png';
      expect(resolveImagePath(basePath, url)).toBeUndefined();
    });

    it('should reject absolute system paths', () => {
      const url = '/etc/passwd';
      expect(resolveImagePath(basePath, url)).toBeUndefined();
    });
  });

  describe('prefixItemId', () => {
    it('should prefix item ID with library ID', () => {
      expect(prefixItemId('bins_standard', 'bin-1x1')).toBe('bins_standard:bin-1x1');
    });
  });

  describe('unprefixItemId', () => {
    it('should extract library and item ID from prefixed ID', () => {
      const result = unprefixItemId('bins_standard:bin-1x1');
      expect(result).toEqual({ libraryId: 'bins_standard', itemId: 'bin-1x1' });
    });

    it('should handle unprefixed IDs (backward compat)', () => {
      const result = unprefixItemId('bin-1x1');
      expect(result).toEqual({ libraryId: 'bins_standard', itemId: 'bin-1x1' });
    });
  });
});
