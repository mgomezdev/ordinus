import type { ComputedSpacer } from '../types/gridfinity';

/** Width/height of the on-screen grid area (the preview minus spacers). */
export function gridAreaAspectRatio(gridX: number, gridY: number, spacers: ComputedSpacer[]): number {
  let horizontal = 0;
  let vertical = 0;
  for (const s of spacers) {
    if (s.position === 'left' || s.position === 'right') horizontal += s.renderWidth;
    else if (s.position === 'top' || s.position === 'bottom') vertical += s.renderHeight;
  }
  return (gridX * (100 - horizontal)) / (gridY * (100 - vertical));
}
