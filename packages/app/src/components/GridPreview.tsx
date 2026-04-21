import { useRef, useMemo } from 'react';
import type { PlacedItemWithValidity, DragData, ComputedSpacer, LibraryItem, ReferenceImage, ImageViewMode, BinCustomization, LibraryMeta } from '../types/gridfinity';
import { PlacedItemOverlay } from './PlacedItemOverlay';
import { SpacerOverlay } from './SpacerOverlay';
import { ReferenceImageOverlay } from './ReferenceImageOverlay';
import { usePointerDropTarget } from '../hooks/usePointerDrag';
import type { SnapPreviewData } from '../hooks/usePointerDrag';
import { SnapPreviewOverlay } from './SnapPreviewOverlay';
import { useWorkspace } from '../contexts/WorkspaceContext';

const EMPTY_SPACERS: ComputedSpacer[] = [];
const EMPTY_REF_IMAGES: ReferenceImage[] = [];

interface RefImageMeta {
  isBroken: boolean;
  imageUrl: string | null;
}

interface GridPreviewProps {
  gridX: number;
  gridY: number;
  placedItems: PlacedItemWithValidity[];
  selectedItemIds: Set<string>;
  spacers?: ComputedSpacer[];
  onDrop: (dragData: DragData, x: number, y: number) => void;
  onSelectItem: (instanceId: string | null, modifiers?: { shift?: boolean; ctrl?: boolean }) => void;
  getItemById: (id: string) => LibraryItem | undefined;
  onDeleteItem?: (instanceId: string) => void;
  onRotateItemCw?: (instanceId: string) => void;
  onRotateItemCcw?: (instanceId: string) => void;
  onItemCustomizationChange?: (instanceId: string, customization: BinCustomization) => void;
  onItemCustomizationReset?: (instanceId: string) => void;
  onDuplicateItem?: () => void;
  referenceImages?: ReferenceImage[];
  selectedImageId?: string | null;
  onImagePositionChange?: (id: string, x: number, y: number) => void;
  onImageSelect?: (id: string) => void;
  onImageScaleChange?: (id: string, scale: number) => void;
  onImageOpacityChange?: (id: string, opacity: number) => void;
  onImageRemove?: (id: string) => void;
  onImageToggleLock?: (id: string) => void;
  onImageRotateCw?: (id: string) => void;
  onImageRotateCcw?: (id: string) => void;
  imageViewMode?: ImageViewMode;
  refImageMetadata?: Map<string, RefImageMeta>;
  onRefImageRebind?: (id: string) => void;
  getLibraryMeta?: (libraryId: string) => Promise<LibraryMeta>;
  snapPreview?: { col: number; row: number; w: number; d: number; valid: boolean } | null;
  onSnapChange?: (preview: SnapPreviewData | null) => void;
}

export function GridPreview({
  gridX,
  gridY,
  placedItems,
  selectedItemIds,
  spacers = EMPTY_SPACERS,
  onDrop,
  onSelectItem,
  getItemById,
  onDeleteItem,
  onRotateItemCw,
  onRotateItemCcw,
  onItemCustomizationChange,
  onItemCustomizationReset,
  onDuplicateItem,
  referenceImages = EMPTY_REF_IMAGES,
  selectedImageId,
  onImagePositionChange,
  onImageSelect,
  onImageScaleChange,
  onImageOpacityChange,
  onImageRemove,
  onImageToggleLock,
  onImageRotateCw,
  onImageRotateCcw,
  imageViewMode = 'ortho',
  refImageMetadata,
  onRefImageRebind,
  getLibraryMeta,
  snapPreview = null,
  onSnapChange,
}: GridPreviewProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const { trackGeneration, instanceGenerationHash, getGenerationEntry } = useWorkspace();

  usePointerDropTarget({
    gridRef,
    gridX,
    gridY,
    onDrop,
    onSnapChange,
  });

  // Memoize cells array (must be before early return per Rules of Hooks)
  const cells = useMemo(() => {
    if (gridX <= 0 || gridY <= 0) return [];
    const result = [];
    for (let y = 0; y < gridY; y++) {
      for (let x = 0; x < gridX; x++) {
        result.push(<div key={`${x}-${y}`} className="grid-cell" />);
      }
    }
    return result;
  }, [gridX, gridY]);

  // Calculate grid offset and size based on spacers (optimized single-loop)
  const { gridOffsetX, gridOffsetY, gridWidth, gridHeight } = useMemo(() => {
    let leftWidth = 0, rightWidth = 0, topHeight = 0, bottomHeight = 0;

    for (const s of spacers) {
      if (s.position === 'left') leftWidth = s.renderWidth;
      else if (s.position === 'right') rightWidth = s.renderWidth;
      else if (s.position === 'top') topHeight = s.renderHeight;
      else if (s.position === 'bottom') bottomHeight = s.renderHeight;
    }

    return {
      gridOffsetX: leftWidth || rightWidth,
      gridOffsetY: topHeight || bottomHeight,
      gridWidth: 100 - (leftWidth + rightWidth),
      gridHeight: 100 - (topHeight + bottomHeight),
    };
  }, [spacers]);

  if (gridX <= 0 || gridY <= 0) {
    return (
      <div className="grid-preview empty">
        <p>Enter dimensions to see grid preview</p>
      </div>
    );
  }

  const handleGridClick = () => {
    onSelectItem(null);
  };

  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onSelectItem(null);
    }
  };

  return (
    <div className="grid-preview" style={{ aspectRatio: `${gridX} / ${gridY}` }}>
      {selectedItemIds.size > 1 && (
        <div className="selection-count-indicator">
          {selectedItemIds.size} items selected
        </div>
      )}
      <div className="drawer-container">
        {spacers.map(spacer => (
          <SpacerOverlay key={spacer.id} spacer={spacer} />
        ))}
        <div
          ref={gridRef}
          className="grid-container"
          role="application"
          aria-label={`Grid layout, ${gridX} columns by ${gridY} rows`}
          tabIndex={0}
          style={{
            gridTemplateColumns: `repeat(${gridX}, 1fr)`,
            gridTemplateRows: `repeat(${gridY}, 1fr)`,
            left: `${gridOffsetX}%`,
            top: `${gridOffsetY}%`,
            width: `${gridWidth}%`,
            height: `${gridHeight}%`,
          }}
          onClick={handleGridClick}
          onKeyDown={handleGridKeyDown}
        >
          {cells}
          {snapPreview && (
            <SnapPreviewOverlay
              col={snapPreview.col}
              row={snapPreview.row}
              w={snapPreview.w}
              d={snapPreview.d}
              valid={snapPreview.valid}
              gridX={gridX}
              gridY={gridY}
            />
          )}
          {placedItems.map(item => {
            const genHash = instanceGenerationHash.get(item.instanceId);
            const generationEntry = genHash ? getGenerationEntry(genHash) : undefined;
            return (
              <PlacedItemOverlay
                key={item.instanceId}
                item={item}
                gridX={gridX}
                gridY={gridY}
                isSelected={selectedItemIds.has(item.instanceId)}
                onSelect={(instanceId, modifiers) => onSelectItem(instanceId, modifiers)}
                getItemById={getItemById}
                onDelete={onDeleteItem}
                onRotateCw={onRotateItemCw}
                onRotateCcw={onRotateItemCcw}
                onCustomizationChange={onItemCustomizationChange}
                onCustomizationReset={onItemCustomizationReset}
                onDuplicate={onDuplicateItem}
                imageViewMode={imageViewMode}
                getLibraryMeta={getLibraryMeta}
                generationEntry={generationEntry}
                onCustomizationChangeWithGeneration={(instanceId, customization) => {
                  const libraryItem = getItemById(item.itemId);
                  if (libraryItem) {
                    const colonIdx = item.itemId.indexOf(':');
                    const libraryId = colonIdx !== -1 ? item.itemId.slice(0, colonIdx) : item.itemId;
                    const bareItemId = colonIdx !== -1 ? item.itemId.slice(colonIdx + 1) : item.itemId;
                    void trackGeneration(instanceId, libraryId, bareItemId, customization);
                  }
                }}
              />
            );
          })}
          {referenceImages.map(image => {
            const meta = refImageMetadata?.get(image.id);
            return (
              <ReferenceImageOverlay
                key={image.id}
                image={image}
                isSelected={image.id === selectedImageId}
                onPositionChange={(x, y) => onImagePositionChange?.(image.id, x, y)}
                onSelect={() => onImageSelect?.(image.id)}
                onScaleChange={(scale) => onImageScaleChange?.(image.id, scale)}
                onOpacityChange={(opacity) => onImageOpacityChange?.(image.id, opacity)}
                onRemove={() => onImageRemove?.(image.id)}
                onToggleLock={() => onImageToggleLock?.(image.id)}
                onRotateCw={() => onImageRotateCw?.(image.id)}
                onRotateCcw={() => onImageRotateCcw?.(image.id)}
                isBroken={meta?.isBroken}
                imageUrl={meta?.imageUrl}
                onRebind={onRefImageRebind ? () => onRefImageRebind(image.id) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
