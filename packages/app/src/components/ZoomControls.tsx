import { MIN_ZOOM, MAX_ZOOM } from '../utils/constants';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToScreen: () => void;
}

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToScreen,
}: ZoomControlsProps) {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="zoom-controls" role="toolbar" aria-label="Zoom controls">
      <button
        className="zoom-control-btn"
        onClick={onZoomOut}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Zoom out"
        title="Zoom out (-)"
      >
        -
      </button>
      <span className="zoom-level" aria-live="polite">
        {zoomPercent}%
      </span>
      <button
        className="zoom-control-btn"
        onClick={onZoomIn}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Zoom in"
        title="Zoom in (+)"
      >
        +
      </button>
      <button
        className="zoom-control-btn"
        onClick={onResetZoom}
        aria-label="Reset zoom"
        title="Reset to 100% (Ctrl+0)"
      >
        1:1
      </button>
      <button
        className="zoom-control-btn"
        onClick={onFitToScreen}
        aria-label="Fit to screen"
        title="Fit to screen"
      >
        Fit
      </button>
    </div>
  );
}
