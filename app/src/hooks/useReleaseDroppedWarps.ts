import { useEffect, useRef } from 'react';
import { deleteWarpedImage } from '../api/refImages.api';
import type { RefImagePlacement } from './useRefImagePlacements';

function warpsInUse(placements: RefImagePlacement[]): Set<string> {
  return new Set(placements.flatMap(p => (p.corners && p.warpedImageUrl ? [p.warpedImageUrl] : [])));
}

/**
 * Asks the server to delete warped images that drop out of the workspace
 * (re-align, unalign, remove, rebind, clear, load). The server keeps any
 * warp a saved layout still references, so this is always safe.
 */
export function useReleaseDroppedWarps(
  placements: RefImagePlacement[],
  release: (warpPath: string) => Promise<unknown> = deleteWarpedImage,
): void {
  const previousRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const current = warpsInUse(placements);
    for (const warpPath of previousRef.current) {
      if (!current.has(warpPath)) {
        release(warpPath).catch(() => {
          // Best effort: the server's periodic sweep catches anything missed
        });
      }
    }
    previousRef.current = current;
  }, [placements, release]);
}
