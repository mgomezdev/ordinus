import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ImageViewMode, DragData } from '../types/gridfinity';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useGridTransform } from '../hooks/useGridTransform';
import { DimensionInput } from '../components/DimensionInput';
import { GridPreview } from '../components/GridPreview';
import { GridSummary } from '../components/GridSummary';
import { SpacerControls } from '../components/SpacerControls';
import { ZoomControls } from '../components/ZoomControls';
import { ImageViewToggle } from '../components/ImageViewToggle';
import { GridViewport } from '../components/GridViewport';
import { SidebarPanel } from '../components/SidebarPanel';
import { WorkspaceToolbar } from '../components/WorkspaceToolbar';
import { LibraryPanel } from '../components/LibraryPanel';
import { exportToPdf } from '../utils/exportPdf';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

const LIBRARY_MIN_WIDTH = 160;
const LIBRARY_MAX_WIDTH = 520;
const LIBRARY_DEFAULT_WIDTH = 260;
const GRIDFINITY_UNIT_MM = 42;

export function WorkspacePage() {
  const ws = useWorkspace();

  const {
    width, setWidth, depth, setDepth, unitSystem, imperialFormat, setImperialFormat,
    spacerConfig, setSpacerConfig, handleUnitChange,
    gridResult, spacers,
    placedItems, selectedItemIds,
    rotateItem, deleteItem,
    selectItem, selectAll, deselectAll, handleDrop, duplicateItem,
    copyItems, pasteItems, deleteSelected, rotateSelected, updateItemCustomization,
    bomItems,
    layoutMeta, isReadOnly,
    refImagePlacements, addRefImagePlacement, removeRefImagePlacement,
    updateRefImagePosition, updateRefImageScale, updateRefImageOpacity,
    updateRefImageRotation, toggleRefImageLock,
    referenceImagesForGrid,
    getItemById, getLibraryMeta,
    handleClearAll, handleReset,
    dialogDispatch,
    exportPdfError, setExportPdfError,
  } = ws;

  // Local UI state
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [libraryWidth, setLibraryWidth] = useState(LIBRARY_DEFAULT_WIDTH);
  const libraryDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const [imageViewMode, setImageViewMode] = useState<ImageViewMode>(
    () => (localStorage.getItem('gridfinity-image-view-mode') as ImageViewMode) || 'ortho'
  );

  const handleLibraryResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    libraryDragRef.current = { startX: e.clientX, startWidth: libraryWidth };
    const onMove = (ev: MouseEvent) => {
      if (!libraryDragRef.current) return;
      const delta = libraryDragRef.current.startX - ev.clientX;
      setLibraryWidth(Math.min(LIBRARY_MAX_WIDTH, Math.max(LIBRARY_MIN_WIDTH, libraryDragRef.current.startWidth + delta)));
    };
    const onUp = () => {
      libraryDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [libraryWidth]);

  // Zoom and pan
  const {
    transform, zoomIn, zoomOut, resetZoom, fitToScreen,
    handleWheel, pan, handleTouchStart, handleTouchMove, handleTouchEnd,
  } = useGridTransform();

  const viewportRef = useRef<HTMLDivElement>(null);
  const isSpaceHeldRef = useRef(false);

  const handleFitToScreen = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const content = viewport.querySelector('.grid-preview') as HTMLElement | null;
    if (!content) return;
    const viewportRect = viewport.getBoundingClientRect();
    fitToScreen(viewportRect.width, viewportRect.height, content.offsetWidth, content.offsetHeight);
  }, [fitToScreen]);

  // Metadata map for broken state / image URLs
  const refImageMetadata = useMemo(() => {
    const map = new Map<string, { isBroken: boolean; imageUrl: string | null }>();
    for (const p of refImagePlacements) {
      map.set(p.id, {
        isBroken: p.refImageId === null,
        imageUrl: p.imageUrl ? `${API_BASE_URL}/images/${p.imageUrl}` : null,
      });
    }
    return map;
  }, [refImagePlacements]);

  // Combined drop handler for both library items and ref images
  const handleCombinedDrop = useCallback((dragData: DragData, x: number, y: number) => {
    if (isReadOnly) return;
    if (dragData.type === 'ref-image' && dragData.refImageId != null) {
      const xPercent = (x / gridResult.gridX) * 100;
      const yPercent = (y / gridResult.gridY) * 100;
      addRefImagePlacement({
        refImageId: dragData.refImageId, name: dragData.refImageName ?? 'Reference Image',
        imageUrl: dragData.refImageUrl ?? '', x: xPercent, y: yPercent,
        width: 25, height: 25, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      });
    } else {
      handleDrop(dragData, x, y);
    }
  }, [isReadOnly, gridResult.gridX, gridResult.gridY, addRefImagePlacement, handleDrop]);

  const handleExportPdf = useCallback(async () => {
    setExportPdfError(null);
    const gridEl = viewportRef.current?.querySelector('.grid-preview') as HTMLElement | null;
    if (!gridEl) return;
    await exportToPdf(
      gridEl,
      bomItems,
      { gridResult, spacerConfig, unitSystem, layoutName: layoutMeta.name },
      () => setExportPdfError('PDF export failed. Please try again.'),
    );
  }, [bomItems, gridResult, spacerConfig, unitSystem, layoutMeta.name, setExportPdfError]);

  const handleFitWidth = useCallback(() => {
    const mm = unitSystem === 'imperial' ? width * 25.4 : width;
    const fitted = Math.max(GRIDFINITY_UNIT_MM, Math.floor(mm / GRIDFINITY_UNIT_MM) * GRIDFINITY_UNIT_MM);
    setWidth(unitSystem === 'imperial' ? fitted / 25.4 : fitted);
  }, [width, unitSystem, setWidth]);

  const handleFitDepth = useCallback(() => {
    const mm = unitSystem === 'imperial' ? depth * 25.4 : depth;
    const fitted = Math.max(GRIDFINITY_UNIT_MM, Math.floor(mm / GRIDFINITY_UNIT_MM) * GRIDFINITY_UNIT_MM);
    setDepth(unitSystem === 'imperial' ? fitted / 25.4 : fitted);
  }, [depth, unitSystem, setDepth]);

  const handleRemoveImage = (id: string) => {
    removeRefImagePlacement(id);
    if (selectedImageId === id) setSelectedImageId(null);
  };

  const handleRebindImage = useCallback((id: string) => {
    dialogDispatch({ type: 'OPEN_REBIND', targetId: id });
  }, [dialogDispatch]);

  const toggleImageViewMode = useCallback(() => {
    setImageViewMode(prev => {
      const next = prev === 'ortho' ? 'perspective' : 'ortho';
      localStorage.setItem('gridfinity-image-view-mode', next);
      return next;
    });
  }, []);

  // Keyboard shortcuts
  const keyDownHandlerRef = useRef<((event: KeyboardEvent) => void) | undefined>(undefined);

  // Update ref after every render so the handler always has fresh closure values
  useEffect(() => {
    keyDownHandlerRef.current = (event: KeyboardEvent) => {
    const activeElement = document.activeElement;
    const isTyping = activeElement?.tagName === 'INPUT' ||
                     activeElement?.tagName === 'TEXTAREA' ||
                     activeElement?.tagName === 'SELECT';
    if (isTyping) return;

    if ((event.key === 'Delete' || event.key === 'Backspace')) {
      if (selectedImageId) {
        event.preventDefault();
        removeRefImagePlacement(selectedImageId);
        setSelectedImageId(null);
        return;
      }
      if (selectedItemIds.size > 0) { event.preventDefault(); deleteSelected(); return; }
    }

    if (event.key === 'r' || event.key === 'R') {
      if (selectedImageId) {
        event.preventDefault();
        updateRefImageRotation(selectedImageId, event.shiftKey ? 'ccw' : 'cw');
        return;
      }
      if (selectedItemIds.size > 0) {
        event.preventDefault();
        rotateSelected(event.shiftKey ? 'ccw' : 'cw');
        return;
      }
    }

    if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); duplicateItem(); return;
    }
    if ((event.key === 'c' || event.key === 'C') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); copyItems(); return;
    }
    if ((event.key === 'v' || event.key === 'V') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); pasteItems(); return;
    }
    if ((event.key === 'v' || event.key === 'V') && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); toggleImageViewMode(); return;
    }
    if (event.key === 'Escape') { deselectAll(); setSelectedImageId(null); return; }
    if ((event.key === 'a' || event.key === 'A') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); selectAll(); return;
    }
    if ((event.key === 'l' || event.key === 'L') && selectedImageId) {
      event.preventDefault(); toggleRefImageLock(selectedImageId); return;
    }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomIn(); return; }
    if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomOut(); return; }
    if (event.key === '0' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); resetZoom(); return;
    }
    if (event.key === '?') {
      event.preventDefault(); dialogDispatch({ type: 'TOGGLE', dialog: 'keyboard' }); return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      isSpaceHeldRef.current = true;
      if (viewportRef.current) viewportRef.current.style.cursor = 'grab';
      return;
    }
    };
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyDownHandlerRef.current?.(e);
    document.addEventListener('keydown', handler);

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        isSpaceHeldRef.current = false;
        if (viewportRef.current) viewportRef.current.style.cursor = '';
      }
    };
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const dimensionsContent = (
    <>
      <div className="unit-toggle-compact">
        <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => handleUnitChange('metric')}>mm</button>
        <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => handleUnitChange('imperial')}>in</button>
      </div>
      {unitSystem === 'imperial' && (
        <div className="format-toggle-compact">
          <button className={imperialFormat === 'decimal' ? 'active' : ''} onClick={() => setImperialFormat('decimal')}>.00</button>
          <button className={imperialFormat === 'fractional' ? 'active' : ''} onClick={() => setImperialFormat('fractional')}>½</button>
        </div>
      )}
      <div className="dimension-input-row">
        <DimensionInput label="Width" value={width} onChange={setWidth} unit={unitSystem} imperialFormat={imperialFormat} />
        <button className="fit-btn" onClick={handleFitWidth} type="button" title="Snap to nearest full grid unit">FIT W</button>
      </div>
      <div className="dimension-input-row">
        <DimensionInput label="Depth" value={depth} onChange={setDepth} unit={unitSystem} imperialFormat={imperialFormat} />
        <button className="fit-btn" onClick={handleFitDepth} type="button" title="Snap to nearest full grid unit">FIT D</button>
      </div>
      <GridSummary
        gridX={gridResult.gridX} gridY={gridResult.gridY}
        gapWidth={gridResult.gapWidth} gapDepth={gridResult.gapDepth}
        unit={unitSystem} imperialFormat={imperialFormat}
      />
    </>
  );

  const spacerContent = (
    <SpacerControls config={spacerConfig} onConfigChange={setSpacerConfig} />
  );

  return (
    <>
      <SidebarPanel
        dimensionsContent={dimensionsContent}
        spacerContent={spacerContent}
        onClearCanvas={handleClearAll}
        onReset={handleReset}
        isReadOnly={isReadOnly}
      />

      <section className={`preview${isReadOnly ? ' canvas-readonly' : ''}`}>
        <nav className="canvas-breadcrumb" aria-label="breadcrumb">
          <span className="canvas-breadcrumb-item">Workspace</span>
          {layoutMeta.name && (
            <>
              <span className="canvas-breadcrumb-sep">›</span>
              <span className="canvas-breadcrumb-item canvas-breadcrumb-current">{layoutMeta.name}</span>
            </>
          )}
        </nav>
        <div className="preview-toolbar">
          <WorkspaceToolbar onExportPdf={handleExportPdf} exportPdfError={exportPdfError} />
          <ImageViewToggle mode={imageViewMode} onToggle={toggleImageViewMode} />
          <ZoomControls zoom={transform.zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onResetZoom={resetZoom} onFitToScreen={handleFitToScreen} />
        </div>
        <GridViewport
          viewportRef={viewportRef}
          transform={transform}
          handleWheel={handleWheel}
          pan={pan}
          isSpaceHeldRef={isSpaceHeldRef}
          handleTouchStart={handleTouchStart}
          handleTouchMove={handleTouchMove}
          handleTouchEnd={handleTouchEnd}
        >
          <GridPreview
            gridX={gridResult.gridX}
            gridY={gridResult.gridY}
            placedItems={placedItems}
            selectedItemIds={selectedItemIds}
            spacers={spacers}
            imageViewMode={imageViewMode}
            onDrop={handleCombinedDrop}
            onSelectItem={(id, mods) => { selectItem(id, mods); if (id) setSelectedImageId(null); }}
            getItemById={getItemById}
            onDeleteItem={deleteItem}
            onRotateItemCw={(id) => rotateItem(id, 'cw')}
            onRotateItemCcw={(id) => rotateItem(id, 'ccw')}
            onItemCustomizationChange={updateItemCustomization}
            onItemCustomizationReset={(id) => updateItemCustomization(id, undefined)}
            onDuplicateItem={duplicateItem}
            getLibraryMeta={getLibraryMeta}
            referenceImages={referenceImagesForGrid}
            selectedImageId={selectedImageId}
            onImagePositionChange={updateRefImagePosition}
            onImageSelect={(id) => { setSelectedImageId(id); deselectAll(); }}
            onImageScaleChange={updateRefImageScale}
            onImageOpacityChange={updateRefImageOpacity}
            onImageRemove={handleRemoveImage}
            onImageToggleLock={toggleRefImageLock}
            onImageRotateCw={(id) => updateRefImageRotation(id, 'cw')}
            onImageRotateCcw={(id) => updateRefImageRotation(id, 'ccw')}
            refImageMetadata={refImageMetadata}
            onRefImageRebind={handleRebindImage}
          />
        </GridViewport>
      </section>

      <div className="library-resize-handle" onMouseDown={handleLibraryResizeStart} role="separator" aria-label="Resize library panel" />
      <LibraryPanel width={libraryWidth} />

    </>
  );
}
