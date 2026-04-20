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

/**
 * Resolve image URL to library-specific path
 * @param libraryId - ID of the library
 * @param libraryBasePath - Base path of the library (e.g., '/libraries/simple-utensils')
 * @param imageUrl - Image URL from library item (optional)
 * @returns Resolved absolute path or undefined
 */
export function resolveImagePath(
  libraryBasePath: string,
  imageUrl?: string
): string | undefined {
  if (!imageUrl) return undefined;

  // Security: Reject paths with parent directory traversal (including URL-encoded variants)
  const decodedUrl = decodeURIComponent(imageUrl);
  if (decodedUrl.includes('..') || decodedUrl.includes('\0')) {
    console.error(`Invalid image path (parent directory traversal or null byte): ${imageUrl}`);
    return undefined;
  }

  // Absolute HTTP/HTTPS URL - return as-is (security: only full URLs)
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // Already resolved to full library path (backward compatibility)
  if (imageUrl.startsWith('/libraries/')) {
    return imageUrl;
  }

  // Security: Reject any other absolute paths (starting with /)
  // Only support relative paths from library root
  if (imageUrl.startsWith('/')) {
    console.error(`Invalid image path (absolute path not allowed): ${imageUrl}`);
    return undefined;
  }

  // Relative path - resolve relative to library base path
  // Supports: "filename.png" or "subfolder/filename.png"
  // Security: Only current directory and subdirectories allowed
  return `${libraryBasePath}/${imageUrl}`;
}
