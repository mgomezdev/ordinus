import { useRef, useCallback } from 'react';
import type { ImageViewMode, PlacedItemWithValidity } from '../types/gridfinity';
import type { RefImagePlacement } from '../hooks/useRefImagePlacements';

interface MobileActionBarProps {
  layoutMeta: { id: number | null; name: string };
  placedItems: PlacedItemWithValidity[];
  refImagePlacements: RefImagePlacement[];
  isSaving: boolean;
  imageViewMode: ImageViewMode;
  onSave: () => void;
  onSaveAsNew: () => void;
  onLoad: () => void;
  onExport: () => Promise<void>;
  onToggleView: () => void;
  onClearAll: () => void;
}

const LONG_PRESS_MS = 500;

export function MobileActionBar({
  layoutMeta,
  placedItems,
  refImagePlacements,
  isSaving,
  imageViewMode,
  onSave,
  onSaveAsNew,
  onLoad,
  onExport,
  onToggleView,
  onClearAll,
}: MobileActionBarProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const hasCanvas = placedItems.length > 0 || refImagePlacements.length > 0;

  const handleSavePointerDown = useCallback(() => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onSaveAsNew();
    }, LONG_PRESS_MS);
  }, [onSaveAsNew]);

  const handleSavePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleSaveClick = useCallback(() => {
    if (longPressTriggeredRef.current) return;
    onSave();
  }, [onSave]);

  const isSaveDisabled = isSaving || (!layoutMeta.id && !hasCanvas);

  return (
    <div className="mobile-action-bar" role="toolbar" aria-label="Workspace actions">
      <button
          className="mab-btn"
          aria-label="Load layout"
          onClick={onLoad}
          type="button"
        >
          <span className="mab-icon" aria-hidden="true">📂</span>
          <span className="mab-label">Load</span>
        </button>

      <button
          className={`mab-btn mab-save${layoutMeta.id ? ' mab-save--has-id' : ' mab-save--new'}`}
          aria-label="Save layout"
          onClick={handleSaveClick}
          onPointerDown={handleSavePointerDown}
          onPointerUp={handleSavePointerUp}
          onPointerLeave={handleSavePointerUp}
          disabled={isSaveDisabled}
          type="button"
        >
          <span className="mab-icon" aria-hidden="true">💾</span>
          <span className="mab-label">{isSaving ? 'Saving…' : 'Save'}</span>
          {layoutMeta.id && !isSaving && (
            <span className="mab-sublabel">hold: new layout</span>
          )}
        </button>

      <button
        className="mab-btn"
        aria-label="Export PDF"
        onClick={onExport}
        disabled={placedItems.length === 0}
        type="button"
      >
        <span className="mab-icon" aria-hidden="true">📄</span>
        <span className="mab-label">Export</span>
      </button>

      <button
        className="mab-btn"
        aria-label="Toggle view"
        onClick={onToggleView}
        type="button"
      >
        <span className="mab-icon" aria-hidden="true">⊞</span>
        <span className="mab-label">{imageViewMode === 'perspective' ? '3D' : 'Ortho'}</span>
      </button>

      <button
        className="mab-btn"
        aria-label="Clear all"
        onClick={onClearAll}
        disabled={!hasCanvas}
        type="button"
      >
        <span className="mab-icon" aria-hidden="true">🗑</span>
        <span className="mab-label">Clear</span>
      </button>
    </div>
  );
}
