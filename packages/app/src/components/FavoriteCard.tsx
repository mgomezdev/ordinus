import { useState, useRef, useCallback } from 'react';
import type { FavoriteItem } from '../types/gridfinity';
import { usePointerDragSource } from '../hooks/usePointerDrag';
import { useImageLoadState } from '../hooks/useImageLoadState';
import { generatedImageUrl } from '../api/generation.api';

interface FavoriteCardProps {
  favorite: FavoriteItem;
  onRemove: () => void;
  onRename: (name: string) => void;
}

const LONG_PRESS_DELAY = 500;
const MAX_PREVIEW_SIZE = 3;

export function FavoriteCard({ favorite, onRemove, onRename }: FavoriteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(favorite.name);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const effectiveImageUrl = (() => {
    if (favorite.paramHash) return generatedImageUrl(favorite.paramHash, 'ortho.png');
    if (favorite.imageUrl) return favorite.imageUrl;
    return undefined;
  })();

  const { imageError, shouldShowImage, handleImageLoad, handleImageError } =
    useImageLoadState(effectiveImageUrl);

  const { onPointerDown } = usePointerDragSource({
    dragData: {
      type: 'favorite',
      itemId: `${favorite.libraryId}:${favorite.libraryItemId}`,
      favoriteCustomization: favorite.customization,
    },
  });

  const startEdit = useCallback(() => {
    setEditValue(favorite.name);
    setIsEditing(true);
  }, [favorite.name]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== favorite.name) {
      onRename(trimmed);
    } else if (trimmed === favorite.name) {
      // No change — just close without calling onRename
    }
    setIsEditing(false);
  }, [editValue, favorite.name, onRename]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(favorite.name);
  }, [favorite.name]);

  const handleNameDoubleClick = useCallback(() => {
    startEdit();
  }, [startEdit]);

  const handleTouchStart = useCallback(() => {
    cancelledRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      if (!cancelledRef.current) {
        startEdit();
      }
    }, LONG_PRESS_DELAY);
  }, [startEdit]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    cancelledRef.current = true;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit],
  );

  // Generate mini grid preview cells (same pattern as LibraryItemCard)
  const previewCells = [];
  for (let y = 0; y < MAX_PREVIEW_SIZE; y++) {
    for (let x = 0; x < MAX_PREVIEW_SIZE; x++) {
      const isActive = x < favorite.widthUnits && y < favorite.heightUnits;
      previewCells.push(
        <div
          key={`${x}-${y}`}
          className={`library-item-preview-cell ${isActive ? 'active' : ''}`}
          style={isActive ? { backgroundColor: favorite.color } : undefined}
        />,
      );
    }
  }

  return (
    <div
      className="favorite-card"
      onPointerDown={isEditing ? undefined : onPointerDown}
      style={{ touchAction: 'none' }}
    >
      <button
        className="favorite-card-remove"
        aria-label="Remove favorite"
        onClick={onRemove}
        type="button"
      >
        🗑
      </button>

      <div className="library-item-preview-container">
        {effectiveImageUrl && !imageError && (
          <img
            src={effectiveImageUrl}
            alt={favorite.name}
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

      <div className="favorite-card-name">
        {isEditing ? (
          <input
            className="favorite-card-name-input"
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={commitEdit}
            onPointerDown={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span
            onDoubleClick={handleNameDoubleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
          >
            {favorite.name}
          </span>
        )}
      </div>
    </div>
  );
}
