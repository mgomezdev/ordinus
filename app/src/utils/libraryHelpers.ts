/**
 * Utility functions for multi-library system
 */

/**
 * Prefix an item ID with its library ID to ensure uniqueness
 * @example prefixItemId('bins_standard', 'bin-1x1') => 'bins_standard:bin-1x1'
 */
export function prefixItemId(libraryId: string, itemId: string): string {
  return `${libraryId}:${itemId}`;
}

/**
 * Extract library ID and item ID from a prefixed ID
 * @example unprefixItemId('bins_standard:bin-1x1') => { libraryId: 'bins_standard', itemId: 'bin-1x1' }
 */
export function unprefixItemId(prefixedId: string): { libraryId: string; itemId: string } {
  const colonIndex = prefixedId.indexOf(':');
  if (colonIndex === -1) {
    // Not prefixed - assume bins_standard library for backward compatibility
    return { libraryId: 'bins_standard', itemId: prefixedId };
  }
  const libraryId = prefixedId.substring(0, colonIndex);
  const itemId = prefixedId.substring(colonIndex + 1);
  return { libraryId, itemId };
}
