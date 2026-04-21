import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import type { PlacedItemWithValidity, LibraryItem, ImageViewMode, BinCustomization, LibraryMeta, CustomizableFieldDef } from '../types/gridfinity';
import { isDefaultCustomization, DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';
import { generatorParamsToBinCustomization } from '../utils/generatorParams';
import { usePointerDragSource } from '../hooks/usePointerDrag';
import { useImageLoadState } from '../hooks/useImageLoadState';
import { BinCustomizationPanel } from './BinCustomizationPanel';
import { getRotatedPerspectiveUrl } from '../utils/imageHelpers';
import { BinContextMenu } from './BinContextMenu';
import { useAuth } from '../contexts/AuthContext';
import { generatedImageUrl } from '../api/generation.api';

interface PlacedItemOverlayProps {
  item: PlacedItemWithValidity;
  gridX: number;
  gridY: number;
  isSelected: boolean;
  onSelect: (instanceId: string, modifiers: { shift: boolean; ctrl: boolean }) => void;
  getItemById: (id: string) => LibraryItem | undefined;
  onDelete?: (instanceId: string) => void;
  onRotateCw?: (instanceId: string) => void;
  onRotateCcw?: (instanceId: string) => void;
  onCustomizationChange?: (instanceId: string, customization: BinCustomization) => void;
  onCustomizationReset?: (instanceId: string) => void;
  onDuplicate?: () => void;
  imageViewMode?: ImageViewMode;
  getLibraryMeta?: (libraryId: string) => Promise<LibraryMeta>;
  generationEntry?: { hash: string; status: 'pending' | 'complete' | 'failed' };
  onCustomizationChangeWithGeneration?: (instanceId: string, customization: BinCustomization) => void;
  onGenerationReset?: (instanceId: string) => void;
}

const DEFAULT_VALID_COLOR = '#3B82F6';
const INVALID_COLOR = '#EF4444';

function getCustomizationBadges(customization: BinCustomization | undefined): string[] {
  if (!customization || isDefaultCustomization(customization)) return [];
  const badges: string[] = [];
  if (customization.wallPatternEnabled) badges.push(customization.wallPattern);
  if (customization.lipStyle !== 'normal') badges.push(`lip: ${customization.lipStyle}`);
  if (customization.fingerSlide !== 'none') badges.push(`slide: ${customization.fingerSlide}`);
  if (customization.wallCutout !== 'none') badges.push(`cutout: ${customization.wallCutout}`);
  if (customization.height !== 8) badges.push(`h: ${customization.height}`);
  return badges;
}

export const PlacedItemOverlay = memo(function PlacedItemOverlay({ item, gridX, gridY, isSelected, onSelect, getItemById, onDelete, onRotateCw, onRotateCcw, onCustomizationChange, onCustomizationReset, onDuplicate, imageViewMode = 'ortho', getLibraryMeta, generationEntry, onCustomizationChangeWithGeneration, onGenerationReset }: PlacedItemOverlayProps) {
  const [showPopover, setShowPopover] = useState(false);
  interface PopoverPos { top: number; left: number; direction: 'above' | 'below' }
  const [popoverPos, setPopoverPos] = useState<PopoverPos | null>(null);
  const [popoverDraft, setPopoverDraft] = useState<BinCustomization | undefined>(undefined);
  const gearButtonRef = useRef<HTMLButtonElement>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [libraryMeta, setLibraryMeta] = useState<LibraryMeta>({ customizableFields: [], parameters: {} });

  const { isAuthenticated } = useAuth();
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!getLibraryMeta) return;
    const colonIdx = item.itemId.indexOf(':');
    if (colonIdx === -1) return;
    const libraryId = item.itemId.slice(0, colonIdx);
    getLibraryMeta(libraryId).then(setLibraryMeta).catch(() => {});
  }, [item.itemId, getLibraryMeta]);

  const computePopoverPos = useCallback(() => {
    if (!gearButtonRef.current) return;
    const rect = gearButtonRef.current.getBoundingClientRect();
    const POPOVER_WIDTH = 260;
    const POPOVER_HEIGHT = 300;
    const MARGIN = 8;
    const GAP = 6;

    const rawLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - POPOVER_WIDTH - MARGIN));

    const spaceAbove = rect.top - MARGIN;
    if (spaceAbove >= POPOVER_HEIGHT) {
      setPopoverPos({ top: rect.top - POPOVER_HEIGHT - GAP, left, direction: 'above' });
    } else {
      setPopoverPos({ top: rect.bottom + GAP, left, direction: 'below' });
    }
  }, []);

  useEffect(() => {
    if (!showPopover) return;
    const handler = () => computePopoverPos();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [showPopover, computePopoverPos]);

  const libraryItem = getItemById(item.itemId);
  const hasStaticStl = !!libraryItem?.stlFile;
  const color = item.isValid ? (libraryItem?.color || DEFAULT_VALID_COLOR) : INVALID_COLOR;

  const perspectiveUrl = libraryItem?.perspectiveImageUrl;
  const orthoUrl = libraryItem?.imageUrl;
  const usingPerspective = imageViewMode === 'perspective' && !!perspectiveUrl;

  // Use explicit rotation-specific URLs when available, fall back to derived
  const getPerspectiveUrlForRotation = (rotation: typeof item.rotation): string | undefined => {
    if (!perspectiveUrl) return undefined;
    if (rotation === 90) return libraryItem?.perspectiveImageUrl90 ?? getRotatedPerspectiveUrl(perspectiveUrl, 90);
    if (rotation === 180) return libraryItem?.perspectiveImageUrl180 ?? getRotatedPerspectiveUrl(perspectiveUrl, 180);
    if (rotation === 270) return libraryItem?.perspectiveImageUrl270 ?? getRotatedPerspectiveUrl(perspectiveUrl, 270);
    return perspectiveUrl; // 0°
  };

  const imageSrc = (() => {
    if (imageViewMode === 'perspective' && perspectiveUrl) {
      return getPerspectiveUrlForRotation(item.rotation);
    }
    return imageViewMode === 'perspective' ? (perspectiveUrl || orthoUrl) : orthoUrl;
  })();

  const isGenerating = generationEntry?.status === 'pending';
  const generationFailed = generationEntry?.status === 'failed';

  const effectiveImageSrc = (() => {
    if (generationEntry?.status === 'complete') {
      const filename = imageViewMode === 'perspective'
        ? `perspective_${item.rotation}.png`
        : 'ortho.png';
      return generatedImageUrl(generationEntry.hash, filename);
    }
    return imageSrc;
  })();

  const { imageError, shouldShowImage, handleImageLoad, handleImageError } =
    useImageLoadState(effectiveImageSrc);

  // Calculate image dimensions for rotation
  // When rotated 90° or 270°, we need to swap dimensions to fill the container
  const isSideways = item.rotation === 90 || item.rotation === 270;
  const aspectRatio = item.width / item.height;

  const getImageStyle = (): React.CSSProperties | undefined => {
    // Perspective images are pre-rendered at the correct angle — no CSS rotation needed
    if (usingPerspective) return undefined;
    if (!item.rotation) return undefined;

    if (isSideways) {
      // When sideways, the image box needs to be inversely proportioned
      // so that after rotation it fills the swapped container
      return {
        transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
        transformOrigin: 'center center',
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `${(1 / aspectRatio) * 100}%`,
        height: `${aspectRatio * 100}%`,
      };
    }

    return { transform: `rotate(${item.rotation}deg)` };
  };

  const { onPointerDown } = usePointerDragSource({
    dragData: {
      type: 'placed',
      itemId: item.itemId,
      instanceId: item.instanceId,
    },
    onTap: (e: PointerEvent) => onSelect(item.instanceId, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }),
  });

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDelete?.(item.instanceId);
  };

  const handleRotateCwClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onRotateCw?.(item.instanceId);
  };

  const handleRotateCcwClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onRotateCcw?.(item.instanceId);
  };

  const handleGearClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isAuthenticated) {
      setSearchParams({ authRequired: '1' }, { replace: true });
      return;
    }
    setPopoverDraft(item.customization);
    computePopoverPos();
    setShowPopover(true);
  }, [isAuthenticated, setSearchParams, item.customization, computePopoverPos]);

  // Updates draft only — generation fires when popover is dismissed
  const handlePopoverChange = useCallback((customization: BinCustomization) => {
    setPopoverDraft(customization);
  }, []);

  const handlePopoverReset = useCallback(() => {
    const allFields = ['wallPattern', 'lipStyle', 'fingerSlide', 'wallCutout', 'height'] as const;
    const allFieldDefs = allFields.map(f => ({ field: f })) as CustomizableFieldDef[];
    const libraryDefaults = item.parameters
      ? generatorParamsToBinCustomization(item.parameters, allFieldDefs)
      : {};
    const hasLibraryDefaults = Object.keys(libraryDefaults).length > 0;
    if (hasLibraryDefaults) {
      onCustomizationChange?.(item.instanceId, { ...DEFAULT_BIN_CUSTOMIZATION, ...libraryDefaults });
    } else {
      onCustomizationReset?.(item.instanceId);
    }
    onGenerationReset?.(item.instanceId);
    // Close without triggering generation — reset already reverts to library images
    setPopoverDraft(undefined);
    setShowPopover(false);
    setPopoverPos(null);
  }, [item, onCustomizationChange, onCustomizationReset, onGenerationReset]);

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDuplicate?.();
  };

  const handleClosePopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (popoverDraft !== undefined) {
      const hasChanges = JSON.stringify(popoverDraft) !== JSON.stringify(item.customization ?? null);
      if (hasChanges) {
        onCustomizationChange?.(item.instanceId, popoverDraft);
        onCustomizationChangeWithGeneration?.(item.instanceId, popoverDraft);
      }
    }
    setPopoverDraft(undefined);
    setShowPopover(false);
    setPopoverPos(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(item.instanceId, { shift: false, ctrl: false });
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => setContextMenuPos(null);

  // Derive: context menu is only visible when the item is selected
  const effectiveContextMenuPos = isSelected ? contextMenuPos : null;

  const badges = getCustomizationBadges(item.customization);

  return (
    <div
      className={`placed-item ${isSelected ? 'selected' : ''} ${!item.isValid ? 'invalid' : ''}`}
      style={{
        left: `${(item.x / gridX) * 100}%`,
        top: `${(item.y / gridY) * 100}%`,
        width: `${(item.width / gridX) * 100}%`,
        height: `${(item.height / gridY) * 100}%`,
        backgroundColor: `${color}66`,
        borderColor: color,
        touchAction: 'none',
      }}
      role="button"
      tabIndex={0}
      aria-label={`${libraryItem?.name ?? 'Item'} at position ${item.x},${item.y}${isSelected ? ', selected' : ''}${!item.isValid ? ', invalid placement' : ''}`}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item.instanceId, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onDelete?.(item.instanceId);
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          if (e.shiftKey) {
            onRotateCcw?.(item.instanceId);
          } else {
            onRotateCw?.(item.instanceId);
          }
        }
      }}
    >
      {isGenerating && (
        <div className="generation-spinner" aria-label="Generating preview" role="status">
          <div className="spinner" />
        </div>
      )}
      {generationFailed && (
        <div className="generation-error" aria-label="Generation failed" role="status">&#10005;</div>
      )}
      {!isGenerating && !generationFailed && effectiveImageSrc && !imageError && (
        <div className="placed-item-image-container">
          <img
            src={effectiveImageSrc}
            alt={libraryItem?.name ?? 'Item'}
            className={`placed-item-image ${shouldShowImage ? 'visible' : 'hidden'}`}
            loading="lazy"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={getImageStyle()}
          />
        </div>
      )}
      <span className="placed-item-label">{libraryItem?.name}</span>
      {badges.length > 0 && (
        <div className="placed-item-badges">
          {badges.map(badge => (
            <span key={badge} className="placed-item-badge">{badge}</span>
          ))}
        </div>
      )}
      {isSelected && (onRotateCcw || onRotateCw || onDuplicate || onCustomizationChange || onDelete) && (
        <div
          className="placed-item-toolbar"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onRotateCcw && (
            <button
              className="placed-item-toolbar-btn"
              onClick={handleRotateCcwClick}
              draggable={false}
              aria-label="Rotate counter-clockwise"
              title="Rotate counter-clockwise (Shift+R)"
            >
              &#8634;
            </button>
          )}
          {onRotateCw && (
            <button
              className="placed-item-toolbar-btn"
              onClick={handleRotateCwClick}
              draggable={false}
              aria-label="Rotate clockwise"
              title="Rotate clockwise (R)"
            >
              &#8635;
            </button>
          )}
          {onDuplicate && (
            <button
              className="placed-item-toolbar-btn"
              onClick={handleDuplicateClick}
              draggable={false}
              aria-label="Duplicate"
              title="Duplicate (Ctrl+D)"
            >
              &#x29C9;
            </button>
          )}
          {onCustomizationChange && libraryMeta.customizableFields.length > 0 && !hasStaticStl && (
            <button
              ref={gearButtonRef}
              className="placed-item-toolbar-btn"
              onClick={handleGearClick}
              draggable={false}
              aria-label="Customize"
              title="Customize bin options"
            >
              &#9881;
            </button>
          )}
          {onDelete && (
            <button
              className="placed-item-toolbar-btn placed-item-toolbar-btn--danger"
              onClick={handleDeleteClick}
              draggable={false}
              aria-label="Remove item"
              title="Remove item (Del)"
            >
              &times;
            </button>
          )}
        </div>
      )}
      {showPopover && isSelected && onCustomizationChange && popoverPos && createPortal(
        <div
          className={`placed-item-customize-popover placed-item-customize-popover--${popoverPos.direction}`}
          role="dialog"
          style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="placed-item-customize-popover-header">
            <span className="placed-item-customize-popover-title">Customize</span>
            <button
              className="placed-item-customize-popover-close"
              onClick={handleClosePopover}
              aria-label="Close customization"
              title="Close"
            >
              &times;
            </button>
          </div>
          <BinCustomizationPanel
            customization={popoverDraft ?? item.customization}
            onChange={handlePopoverChange}
            onReset={handlePopoverReset}
            idPrefix="inline-"
            customizableFields={libraryMeta.customizableFields}
            parameters={item.parameters}
          />
        </div>,
        document.body
      )}
      {effectiveContextMenuPos && (
        <BinContextMenu
          x={effectiveContextMenuPos.x}
          y={effectiveContextMenuPos.y}
          onRotateCw={() => onRotateCw?.(item.instanceId)}
          onRotateCcw={() => onRotateCcw?.(item.instanceId)}
          onDuplicate={() => onDuplicate?.()}
          onCustomize={hasStaticStl ? undefined : () => { computePopoverPos(); setShowPopover(true); }}
          onDelete={() => onDelete?.(item.instanceId)}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
});
