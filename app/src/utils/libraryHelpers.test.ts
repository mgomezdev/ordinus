import { describe, it, expect } from 'vitest';
import { prefixItemId, unprefixItemId } from './libraryHelpers';

describe('libraryHelpers', () => {
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
