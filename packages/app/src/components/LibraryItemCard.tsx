import { useState, useCallback, useRef } from 'react';
import type { LibraryItem } from '../types/gridfinity';
import { usePointerDragSource } from '../hooks/usePointerDrag';
import { useImageLoadState } from '../hooks/useImageLoadState';
import { ItemPreviewPopover } from './ItemPreviewPopover';
import { generatedImageUrl } from '../api/generation.api';

interface LibraryItemCardProps {
  item: LibraryItem;
}

const HOVER_DELAY = 200;

export function LibraryItemCard({ item }: LibraryItemCardProps) {
  const effectiveImageUrl = (() => {
    if (item.imageUrl) return item.imageUrl;
    if (item.paramHash) {
      // Try loading speculatively — may already be done from prior server start
      return generatedImageUrl(item.paramHash, 'ortho.png');
    }
    return undefined;
  })();

  const { imageError, shouldShowImage, handleImageLoad, handleImageError } =
    useImageLoadState(effectiveImageUrl);

  const [previewAnchorRect, setPreviewAnchorRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const hasAnyImage = !!(item.perspectiveImageUrl || item.imageUrl);

  const hidePopover = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPreviewAnchorRect(null);
  }, []);

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse' || !hasAnyImage) return;

      hoverTimerRef.current = setTimeout(() => {
        if (cardRef.current) {
          setPreviewAnchorRect(cardRef.current.getBoundingClientRect());
        }
      }, HOVER_DELAY);
    },
    [hasAnyImage],
  );

  const handlePointerLeave = useCallback(() => {
    hidePopover();
  }, [hidePopover]);

  const handleTap = useCallback(() => {
    if (!hasAnyImage) return;

    setPreviewAnchorRect((prev) => {
      if (prev) return null; // toggle off
      return cardRef.current?.getBoundingClientRect() ?? null;
    });
  }, [hasAnyImage]);

  const { onPointerDown } = usePointerDragSource({
    dragData: {
      type: 'library',
      itemId: item.id,
    },
    onTap: handleTap,
  });

  const handlePointerDownWrapper = useCallback(
    (e: React.PointerEvent) => {
      hidePopover();
      onPointerDown(e);
    },
    [hidePopover, onPointerDown],
  );

  const isGenerating = !!(item.paramHash && !shouldShowImage && !imageError);

  // Generate mini grid preview
  const previewCells = [];
  const maxPreviewSize = 3;
  for (let y = 0; y < maxPreviewSize; y++) {
    for (let x = 0; x < maxPreviewSize; x++) {
      const isActive = x < item.widthUnits && y < item.heightUnits;
      previewCells.push(
        <div
          key={`${x}-${y}`}
          className={`library-item-preview-cell ${isActive ? 'active' : ''}`}
          style={isActive ? { backgroundColor: item.color } : undefined}
        />
      );
    }
  }

  return (
    <>
      <div
        ref={cardRef}
        className="library-item-card"
        onPointerDown={handlePointerDownWrapper}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={{ touchAction: 'none' }}
        role="button"
        tabIndex={0}
        aria-label={`${item.name}, ${item.widthUnits} by ${item.heightUnits} units. Drag to place on grid.`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
          }
        }}
      >
        <div className="library-item-preview-container">
          {isGenerating && (
            <div className="generation-spinner" aria-label="Generating" role="status">
              <div className="spinner" />
            </div>
          )}
          {effectiveImageUrl && !imageError && (
            <img
              src={effectiveImageUrl}
              alt={item.name}
              className={`library-item-image ${shouldShowImage ? 'visible' : 'hidden'}`}
              loading="lazy"
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}
          {!shouldShowImage && (
            <div className="library-item-preview">
              {previewCells}
            </div>
          )}
        </div>
        <div className="library-item-info">
          <span className="library-item-name">{item.name}</span>
          <span className="library-item-size">{item.widthUnits}x{item.heightUnits}</span>
        </div>
      </div>
      {previewAnchorRect && (
        <ItemPreviewPopover item={item} anchorRect={previewAnchorRect} />
      )}
    </>
  );
}
