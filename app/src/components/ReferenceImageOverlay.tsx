import { useState, useRef, useEffect, memo } from 'react';
import type { ReferenceImage } from '../types/gridfinity';

interface ReferenceImageOverlayProps {
  image: ReferenceImage;
  isSelected: boolean;
  onPositionChange: (x: number, y: number) => void;
  onSelect: () => void;
  onScaleChange: (scale: number) => void;
  onOpacityChange: (opacity: number) => void;
  onRemove: () => void;
  onToggleLock: () => void;
  onRotateCw?: () => void;
  onRotateCcw?: () => void;
  isBroken?: boolean;
  imageUrl?: string | null;
  onRebind?: () => void;
}

interface DragStartCoords {
  startX: number;
  startY: number;
  startImageX: number;
  startImageY: number;
}

export const ReferenceImageOverlay = memo(function ReferenceImageOverlay({
  image,
  isSelected,
  onPositionChange,
  onSelect,
  onScaleChange,
  onOpacityChange,
  onRemove,
  onToggleLock,
  onRotateCw,
  onRotateCcw,
  isBroken,
  imageUrl,
  onRebind,
}: ReferenceImageOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<DragStartCoords | null>(null);

  const handleImageError = () => {
    console.error(`Failed to load reference image: ${image.name}`);
    setImageLoadError(true);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    onSelect();

    if (image.isLocked) return;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startImageX: image.x,
      startImageY: image.y,
    };
    setIsDragging(true);
  };

  const handleToolbarPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percentage = Number(e.target.value);
    onOpacityChange(percentage / 100);
  };

  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percentage = Number(e.target.value);
    onScaleChange(percentage / 100);
  };

  // Attach global pointer event listeners during drag
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const coords = dragStartRef.current;
      if (!coords) return;

      const container = containerRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const deltaX = e.clientX - coords.startX;
      const deltaY = e.clientY - coords.startY;

      // Convert pixel delta to percentage
      const deltaXPercent = (deltaX / rect.width) * 100;
      const deltaYPercent = (deltaY / rect.height) * 100;

      const newX = coords.startImageX + deltaXPercent;
      const newY = coords.startImageY + deltaYPercent;

      // Clamp to 0-100 range
      const clampedX = Math.max(0, Math.min(100, newX));
      const clampedY = Math.max(0, Math.min(100, newY));

      onPositionChange(clampedX, clampedY);
    };

    const handlePointerUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
    };

    const handlePointerCancel = () => {
      dragStartRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [isDragging, onPositionChange]);

  const baseClassName = 'reference-image-overlay';
  const interactiveClassName = `${baseClassName}--interactive`;
  const draggingClassName = isDragging ? `${baseClassName}--dragging` : '';
  const lockedClassName = image.isLocked ? `${baseClassName}--locked` : '';
  const selectedClassName = isSelected ? `${baseClassName}--selected` : '';

  const className = [
    baseClassName,
    interactiveClassName,
    draggingClassName,
    lockedClassName,
    selectedClassName,
  ]
    .filter(Boolean)
    .join(' ');

  // Outer wrapper handles positioning only — no transform or opacity
  const wrapperStyle: React.CSSProperties = {
    left: `${image.x}%`,
    top: `${image.y}%`,
    width: `${image.width}%`,
    height: `${image.height}%`,
    pointerEvents: 'auto',
    touchAction: image.isLocked ? undefined : 'none',
  };

  // Inner content carries the visual transforms (scale + opacity)
  const contentStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    opacity: image.opacity,
    transform: `scale(${image.scale})${image.rotation ? ` rotate(${image.rotation}deg)` : ''}`,
    transformOrigin: 'top left',
  };

  const opacityPercentage = Math.round(image.opacity * 100);
  const scalePercentage = Math.round(image.scale * 100);

  return (
    <div
      ref={containerRef}
      className={className}
      style={wrapperStyle}
      onPointerDown={handlePointerDown}
    >
      {isSelected && (
        <div
          className="reference-image-overlay__toolbar"
          onPointerDown={handleToolbarPointerDown}
        >
          <label className="reference-image-overlay__toolbar-label">
            Opacity
            <input
              id="opacity-slider"
              type="range"
              min="0"
              max="100"
              value={opacityPercentage}
              onChange={handleOpacityChange}
              className="reference-image-overlay__toolbar-slider"
              title={`Opacity: ${opacityPercentage}%`}
              aria-label={`Opacity: ${opacityPercentage}%`}
            />
          </label>
          <label className="reference-image-overlay__toolbar-label">
            Scale
            <input
              id="scale-slider"
              type="range"
              min="10"
              max="200"
              value={scalePercentage}
              onChange={handleScaleChange}
              className="reference-image-overlay__toolbar-slider"
              title={`Scale: ${scalePercentage}%`}
              aria-label={`Scale: ${scalePercentage}%`}
            />
          </label>
          <button
            className="reference-image-overlay__toolbar-btn reference-image-overlay__toolbar-btn--lock"
            onClick={onToggleLock}
            title={image.isLocked ? 'Unlock image (L)' : 'Lock image (L)'}
            aria-label={image.isLocked ? 'Unlock image' : 'Lock image'}
          >
            {image.isLocked ? 'Unlock' : 'Lock'}
          </button>
          {onRotateCcw && (
            <button
              className="reference-image-overlay__toolbar-btn reference-image-overlay__toolbar-btn--rotate"
              onClick={onRotateCcw}
              title="Rotate counter-clockwise (Shift+R)"
              aria-label="Rotate counter-clockwise"
            >
              &#8634;
            </button>
          )}
          {onRotateCw && (
            <button
              className="reference-image-overlay__toolbar-btn reference-image-overlay__toolbar-btn--rotate"
              onClick={onRotateCw}
              title="Rotate clockwise (R)"
              aria-label="Rotate clockwise"
            >
              &#8635;
            </button>
          )}
          {isBroken && onRebind && (
            <button
              className="ref-image-rebind-btn"
              onClick={onRebind}
              title="Rebind to a different image"
              aria-label="Rebind image"
            >
              Rebind
            </button>
          )}
          <button
            className="reference-image-overlay__toolbar-btn reference-image-overlay__toolbar-btn--remove"
            onClick={onRemove}
            title="Remove image (Delete)"
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      )}
      <div className="reference-image-overlay__content" style={contentStyle}>
        {isBroken ? (
          <div className="ref-image-broken">
            <span className="ref-image-broken-icon">&#10060;</span>
            <span>Image Removed</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>{image.name}</span>
          </div>
        ) : imageLoadError ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(200, 50, 50, 0.2)',
              border: '2px dashed rgba(200, 50, 50, 0.5)',
              color: '#c83232',
              fontSize: '14px',
              fontWeight: 'bold',
              textAlign: 'center',
              padding: '10px',
            }}
          >
            Failed to load image
          </div>
        ) : (
          <img
            src={imageUrl ?? image.dataUrl}
            alt={image.name}
            draggable={false}
            onError={handleImageError}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              userSelect: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
});
