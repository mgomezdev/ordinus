interface SnapPreviewOverlayProps {
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
        left: `${(col / gridX) * 100}%`,
        top: `${(row / gridY) * 100}%`,
        width: `${(w / gridX) * 100}%`,
        height: `${(d / gridY) * 100}%`,
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden="true"
    />
  );
}
