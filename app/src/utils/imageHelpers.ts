import type { Rotation } from '../types/gridfinity';

/**
 * Derives a rotation-specific perspective image URL from the base perspective URL.
 *
 * Convention: base `foo-perspective.png` → rotated `foo-perspective-{90,180,270}.png`
 * For 0° rotation, returns the original URL unchanged.
 * If the URL doesn't match the `-perspective.png` pattern, returns it unchanged.
 */
export function getRotatedPerspectiveUrl(perspectiveUrl: string, rotation: Rotation): string {
  if (!perspectiveUrl || rotation === 0) return perspectiveUrl;
  if (!perspectiveUrl.endsWith('-perspective.png')) return perspectiveUrl;
  return perspectiveUrl.replace(/-perspective\.png$/, `-perspective-${rotation}.png`);
}
