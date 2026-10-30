import { GRID_RESOLUTION } from '@gridfinity/shared';

/** col, row, w and d are in half-cells; gridX and gridY in units. */
export interface SnapPreviewOverlayProps {
  col: number;
  row: number;
  w: number;
  d: number;
  valid: boolean;
  gridX: number;
  gridY: number;
}

export function SnapPreviewOverlay({ col, row, w, d, valid, gridX, gridY }: SnapPreviewOverlayProps) {
  return (
    <div
      className={`snap-preview ${valid ? 'snap-preview--valid' : 'snap-preview--invalid'}`}
      style={{
        position: 'absolute',
        left: `${(col / (gridX * GRID_RESOLUTION)) * 100}%`,
        top: `${(row / (gridY * GRID_RESOLUTION)) * 100}%`,
        width: `${(w / (gridX * GRID_RESOLUTION)) * 100}%`,
        height: `${(d / (gridY * GRID_RESOLUTION)) * 100}%`,
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden="true"
    />
  );
}
