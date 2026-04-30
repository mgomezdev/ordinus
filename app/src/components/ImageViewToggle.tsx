import type { ImageViewMode } from '../types/gridfinity';

interface ImageViewToggleProps {
  mode: ImageViewMode;
  onToggle: () => void;
}

export function ImageViewToggle({ mode, onToggle }: ImageViewToggleProps) {
  const isOrtho = mode === 'ortho';

  return (
    <button
      className={`image-view-toggle-btn zoom-control-btn${isOrtho ? '' : ' active'}`}
      onClick={onToggle}
      aria-label="Toggle image view mode"
      title={isOrtho ? 'Switch to 3D view (V)' : 'Switch to top view (V)'}
    >
      {isOrtho ? 'Top' : '3D'}
    </button>
  );
}
