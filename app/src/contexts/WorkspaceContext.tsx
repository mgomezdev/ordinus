import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type {
  UnitSystem, ImperialFormat, GridSpacerConfig, LibraryItem,
  LibraryMeta, DragData, BinCustomization, Category,
  GridResult, ReferenceImage, PlacedItemWithValidity,
  ComputedSpacer, BOMExtras,
} from '../types/gridfinity';
import type { SelectModifiers } from '../hooks/useGridItems';
import type { BOMItem, CustomBinSpec, CuratedEntry, ApiLayoutDetail } from '@gridfinity/shared';
import { matchCuratedEntry } from '@gridfinity/shared';
import type { RefImagePlacement, UseRefImagePlacementsReturn } from '../hooks/useRefImagePlacements';
import type { LayoutMetaState } from '../reducers/layoutMetaReducer';
import type { DialogState, DialogAction } from '../reducers/dialogReducer';
import { calculateGrid, mmToInches, inchesToMm } from '../utils/conversions';
import { useLayoutMeta } from '../hooks/useLayoutMeta';
import { useDialogState } from '../hooks/useDialogState';
import { useGridItems } from '../hooks/useGridItems';
import { useSpacerCalculation } from '../hooks/useSpacerCalculation';
import { useBillOfMaterials } from '../hooks/useBillOfMaterials';
import { useBOMExtras } from '../hooks/useBOMExtras';
import { useLibraries } from '../hooks/useLibraries';
import { useLibraryData } from '../hooks/useLibraryData';
import { useCategoryData } from '../hooks/useCategoryData';
import { useCustomBins } from '../hooks/useCustomBins';
import { useRefImagePlacements } from '../hooks/useRefImagePlacements';
import { useReleaseDroppedWarps } from '../hooks/useReleaseDroppedWarps';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useLayoutLoader } from '../hooks/useLayoutLoader';
import { useGenerationState } from '../hooks/useGenerationState';
import type { GenerationEntry } from '../hooks/useGenerationState';
import { requestGenerationApi } from '../api/generation.api';
import { API_BASE_URL } from '../api/apiClient';
import { buildPayload } from '../utils/layoutHelpers';
import { useWorkspaceLiveSync } from '../hooks/useWorkspaceLiveSync';
import type { WorkspaceLiveSync } from '../hooks/useWorkspaceLiveSync';

// ConfirmDialog props shape returned by useConfirmDialog
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

interface WorkspaceContextValue {
  liveSync?: WorkspaceLiveSync;
  // Dimensions
  width: number;
  setWidth: (w: number) => void;
  depth: number;
  setDepth: (d: number) => void;
  unitSystem: UnitSystem;
  imperialFormat: ImperialFormat;
  setImperialFormat: (f: ImperialFormat) => void;
  spacerConfig: GridSpacerConfig;
  setSpacerConfig: (c: GridSpacerConfig) => void;
  handleUnitChange: (newUnit: UnitSystem) => void;

  // Derived grid
  gridResult: GridResult;
  drawerWidth: number;
  drawerDepth: number;
  spacers: ComputedSpacer[];

  // Grid items
  placedItems: PlacedItemWithValidity[];
  selectedItemIds: Set<string>;
  handleDrop: (dragData: DragData, x: number, y: number) => void;
  rotateItem: (instanceId: string, direction: 'cw' | 'ccw') => void;
  deleteItem: (instanceId: string) => void;
  selectItem: (instanceId: string | null, modifiers?: SelectModifiers) => void;
  selectAll: () => void;
  deselectAll: () => void;
  duplicateItem: () => void;
  copyItems: () => void;
  pasteItems: () => void;
  deleteSelected: () => void;
  rotateSelected: (direction: 'cw' | 'ccw') => void;
  updateItemCustomization: (instanceId: string, customization: BinCustomization | undefined) => void;

  // BOM
  bomItems: BOMItem[];

  // BOM extras
  extras: BOMExtras;
  addExtra: (key: string) => void;
  setExtraQty: (key: string, qty: number) => void;
  removeExtra: (key: string) => void;

  // Layout meta
  layoutMeta: LayoutMetaState;
  handleSaveComplete: (layoutId: number, name: string, revision?: number) => void;

  // Dirty state
  isDirty: boolean;

  // Ref images
  refImagePlacements: RefImagePlacement[];
  addRefImagePlacement: UseRefImagePlacementsReturn['addPlacement'];
  removeRefImagePlacement: UseRefImagePlacementsReturn['removePlacement'];
  updateRefImagePosition: UseRefImagePlacementsReturn['updatePosition'];
  updateRefImageScale: UseRefImagePlacementsReturn['updateScale'];
  updateRefImageOpacity: UseRefImagePlacementsReturn['updateOpacity'];
  updateRefImageRotation: UseRefImagePlacementsReturn['updateRotation'];
  toggleRefImageLock: UseRefImagePlacementsReturn['toggleLock'];
  applyRefImageAlignment: UseRefImagePlacementsReturn['applyAlignment'];
  clearRefImageAlignment: UseRefImagePlacementsReturn['clearAlignment'];
  referenceImagesForGrid: ReferenceImage[];

  // Library
  libraryItems: LibraryItem[];
  isLibraryLoading: boolean;
  isLibrariesLoading: boolean;
  libraryError: Error | null;
  librariesError: Error | null;
  categories: Category[];
  getItemById: (prefixedId: string) => LibraryItem | undefined;
  addCustomBin: (spec: CustomBinSpec) => Promise<boolean>;
  placeCuratedBin: (entry: CuratedEntry, width: number, depth: number, choices: Record<string, string>, x: number, y: number) => Promise<boolean>;
  getLibraryMeta: (libraryId: string) => Promise<LibraryMeta>;

  // Layout actions
  loadLayout: (id: number) => Promise<void>;
  handleClearAll: () => Promise<void>;
  handleReset: () => void;

  // Mutations

  // Dialogs
  dialogs: DialogState;
  dialogDispatch: React.Dispatch<DialogAction>;
  closeRebind: () => void;
  handleRebindSelect: (refImageId: number, imageUrl: string, name: string) => void;
  confirmDialogProps: ConfirmDialogProps;

  // Export
  exportPdfError: string | null;
  setExportPdfError: (err: string | null) => void;

  // Generation
  getGenerationEntry: (hash: string) => GenerationEntry | undefined;
  trackGeneration: (instanceId: string, libraryId: string, itemId: string, customization: BinCustomization | undefined) => Promise<void>;
  instanceGenerationHash: Map<string, string>;
  clearInstanceHash: (instanceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  // Dimensions
  const [width, setWidth] = useState(168);
  const [depth, setDepth] = useState(168);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [imperialFormat, setImperialFormat] = useState<ImperialFormat>('decimal');
  const [spacerConfig, setSpacerConfig] = useState<GridSpacerConfig>({
    horizontal: 'none',
    vertical: 'none',
  });

  const [exportPdfError, setExportPdfError] = useState<string | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const mountedRef = useRef(false);
  const skipNextDirtyRef = useRef(false);

  // Hooks
  const { dialogs, dialogDispatch, closeRebind } = useDialogState();
  const {
    layoutMeta, layoutDispatch,
    handleSaveComplete: rawHandleSaveComplete,
    handleClearLayout,
  } = useLayoutMeta();

  const { confirm, dialogProps: confirmDialogProps } = useConfirmDialog();

  // Library
  const {
    availableLibraries,
    isLoading: isLibrariesLoading,
    error: librariesError,
  } = useLibraries();

  const allLibraryIds = useMemo(() => availableLibraries.map(l => l.id), [availableLibraries]);

  const {
    items: libraryItems,
    isLoading: isLibraryLoading,
    error: libraryError,
    getItemById: getLibraryItemById,
    getLibraryMeta,
  } = useLibraryData(allLibraryIds);

  const { categories } = useCategoryData(libraryItems);

  // Ref images
  const {
    placements: refImagePlacements,
    addPlacement: addRefImagePlacement,
    removePlacement: removeRefImagePlacement,
    updatePosition: updateRefImagePosition,
    updateScale: updateRefImageScale,
    updateOpacity: updateRefImageOpacity,
    updateRotation: updateRefImageRotation,
    toggleLock: toggleRefImageLock,
    rebindImage: rebindRefImage,
    applyAlignment: applyRefImageAlignment,
    clearAlignment: clearRefImageAlignment,
    loadPlacements: loadRefImagePlacements,
    clearAll: clearRefImages,
  } = useRefImagePlacements();

  useReleaseDroppedWarps(refImagePlacements);

  // Derived grid
  const gridResult = useMemo(() => calculateGrid(width, depth, unitSystem), [width, depth, unitSystem]);
  const drawerWidth = unitSystem === 'metric' ? width : inchesToMm(width);
  const drawerDepth = unitSystem === 'metric' ? depth : inchesToMm(depth);

  const spacers = useSpacerCalculation(
    unitSystem === 'metric' ? gridResult.gapWidth : inchesToMm(gridResult.gapWidth),
    unitSystem === 'metric' ? gridResult.gapDepth : inchesToMm(gridResult.gapDepth),
    spacerConfig,
    drawerWidth,
    drawerDepth,
  );

  // Grid items
  const {
    placedItems, selectedItemIds, rotateItem, deleteItem, clearAll, loadItems,
    selectItem, selectAll, deselectAll, handleDrop, duplicateItem,
    copyItems, pasteItems, deleteSelected, rotateSelected, updateItemCustomization, addCustomItem, placeLibraryItemAt,
  } = useGridItems(gridResult.gridX, gridResult.gridY, getLibraryItemById);
  const placeAtRef = useRef(placeLibraryItemAt);
  useEffect(() => { placeAtRef.current = placeLibraryItemAt; }, [placeLibraryItemAt]);

  const { resolveItem: getItemById, createCustomItem, customItems } = useCustomBins(getLibraryItemById, placedItems);
  const bomLibraryItems = useMemo(() => [...libraryItems, ...customItems], [libraryItems, customItems]);

  const bomItems = useBillOfMaterials(placedItems, bomLibraryItems);
  const { extras, addExtra, setExtraQty, removeExtra, clearExtras } = useBOMExtras();

  // Convert ref image placements to ReferenceImage format for GridPreview
  const referenceImagesForGrid: ReferenceImage[] = useMemo(
    () =>
      refImagePlacements.map(p => ({
        id: p.id, name: p.name, dataUrl: '',
        x: p.x, y: p.y, width: p.width, height: p.height,
        opacity: p.opacity, scale: p.scale, isLocked: p.isLocked, rotation: p.rotation,
        isAligned: Boolean(p.corners && p.warpedImageUrl),
      })),
    [refImagePlacements],
  );

  // Unit change handler
  const handleUnitChange = useCallback((newUnit: UnitSystem) => {
    if (newUnit === unitSystem) return;
    if (newUnit === 'imperial') {
      setWidth(parseFloat(mmToInches(width).toFixed(4)));
      setDepth(parseFloat(mmToInches(depth).toFixed(4)));
    } else {
      setWidth(Math.round(inchesToMm(width)));
      setDepth(Math.round(inchesToMm(depth)));
    }
    setUnitSystem(newUnit);
  }, [unitSystem, width, depth]);

  const handleSaveComplete = useCallback((id: number, name: string, revision?: number) => {
    rawHandleSaveComplete(id, name, revision);
    setIsDirty(false);
  }, [rawHandleSaveComplete]);

  const { loadLayout: rawLoadLayout, loadDetail } = useLayoutLoader({
    unitSystem, setWidth, setDepth, setSpacerConfig,
    loadItems, loadRefImagePlacements, layoutDispatch,
    clearExtras,
  });

  const loadLayout = useCallback(async (id: number) => {
    skipNextDirtyRef.current = true;
    await rawLoadLayout(id);
    setIsDirty(false);
  }, [rawLoadLayout]);

  // handleClearAll: confirms then clears items and ref images
  const handleClearAll = useCallback(async () => {
    const message = refImagePlacements.length > 0
      ? `Remove all ${placedItems.length} placed items and ${refImagePlacements.length} reference images?`
      : `Remove all ${placedItems.length} placed items?`;
    if (await confirm({ title: 'Clear All', message, variant: 'danger', confirmLabel: 'Clear All', cancelLabel: 'Cancel' })) {
      clearAll();
      clearRefImages();
      handleClearLayout();
    }
  }, [refImagePlacements.length, placedItems.length, confirm, clearAll, clearRefImages, handleClearLayout]);

  const handleReset = useCallback(() => {
    setWidth(168);
    setDepth(168);
    setUnitSystem('metric');
    setSpacerConfig({ horizontal: 'none', vertical: 'none' });
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (skipNextDirtyRef.current) {
      skipNextDirtyRef.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDirty(true);
  }, [placedItems, refImagePlacements, spacerConfig, drawerWidth, drawerDepth]);

  // Generation state
  const { getEntry: getGenerationEntry, trackHash } = useGenerationState(API_BASE_URL);

  const [instanceGenerationHash, setInstanceGenerationHash] = useState<Map<string, string>>(new Map());
  const recordInstanceHash = useCallback((instanceId: string, hash: string) => {
    setInstanceGenerationHash(prev => { const m = new Map(prev); m.set(instanceId, hash); return m; });
  }, []);

  const clearInstanceHash = useCallback((instanceId: string) => {
    setInstanceGenerationHash(prev => { const m = new Map(prev); m.delete(instanceId); return m; });
  }, []);

  const trackGeneration = useCallback(
    async (instanceId: string, libraryId: string, itemId: string, customization: BinCustomization | undefined) => {
      try {
        const { hash, status } = await requestGenerationApi(libraryId, itemId, customization);
        trackHash(hash, status);
        recordInstanceHash(instanceId, hash);
      } catch {
        // non-critical — UI will just not show spinner
      }
    },
    [trackHash, recordInstanceHash],
  );

  const addCustomBin = useCallback(async (spec: CustomBinSpec): Promise<boolean> => {
    const { item, status } = await createCustomItem(spec);
    const instanceId = addCustomItem(item);
    if (!instanceId || !item.paramHash) return false;
    trackHash(item.paramHash, status);
    recordInstanceHash(instanceId, item.paramHash);
    return true;
  }, [createCustomItem, addCustomItem, trackHash, recordInstanceHash]);

  const placeCuratedBin = useCallback(async (entry: CuratedEntry, width: number, depth: number, choices: Record<string, string>, x: number, y: number): Promise<boolean> => {
    const match = matchCuratedEntry(entry, width, depth, choices);
    if (!match) return false;
    if (entry.kind === 'fixed') {
      const item = getLibraryItemById(entry.sourceId);
      if (!item || item.isActive === false || item.widthUnits !== entry.width || item.heightUnits !== entry.depth) return false;
      return placeLibraryItemAt(item, x, y, match.rotation) !== null;
    }
    if (!match.spec) return false;
    const { item, status } = await createCustomItem(match.spec);
    const id = placeAtRef.current(item, x, y, match.rotation);
    if (!id || !item.paramHash) return false;
    trackHash(item.paramHash, status);
    recordInstanceHash(id, item.paramHash);
    return true;
  }, [getLibraryItemById, placeLibraryItemAt, createCustomItem, trackHash, recordInstanceHash]);

  // Rebind image select handler
  const handleRebindSelect = useCallback((refImageId: number, imageUrl: string, name: string) => {
    if (dialogs.rebindTargetId) {
      rebindRefImage(dialogs.rebindTargetId, refImageId, imageUrl, name);
    }
    closeRebind();
  }, [dialogs.rebindTargetId, rebindRefImage, closeRebind]);

  const workspacePayload = buildPayload(layoutMeta.name, layoutMeta.description, gridResult.gridX, gridResult.gridY, drawerWidth, drawerDepth, spacerConfig, placedItems, refImagePlacements);
  const workspaceContent = JSON.stringify({ ...workspacePayload, refImagePlacements: workspacePayload.refImagePlacements ?? [] });
  const liveSync = useWorkspaceLiveSync({ id: layoutMeta.id, revision: layoutMeta.revision, content: workspaceContent, dirty: isDirty,
    apply: (detail: ApiLayoutDetail) => {
      skipNextDirtyRef.current = true;
      loadDetail(detail, true); setIsDirty(false);
      for (const item of detail.placedItems) {
        const instanceId = item.stableId ? `item-${item.stableId}` : '';
        const old = placedItems.find(bin => bin.instanceId === instanceId);
        if (instanceId && JSON.stringify(old?.customization) !== JSON.stringify(item.customization)) {
          clearInstanceHash(instanceId);
          if (item.customization && !item.customSpec) void trackGeneration(instanceId, item.libraryId, item.itemId, item.customization);
        }
      }
    },
    saved: (detail, unchanged) => { rawHandleSaveComplete(detail.id, detail.name, detail.revision); if (unchanged) setIsDirty(false); },
  });

  const value: WorkspaceContextValue = {
    liveSync,
    // Dimensions
    width,
    setWidth,
    depth,
    setDepth,
    unitSystem,
    imperialFormat,
    setImperialFormat,
    spacerConfig,
    setSpacerConfig,
    handleUnitChange,

    // Derived grid
    gridResult,
    drawerWidth,
    drawerDepth,
    spacers,

    // Grid items
    placedItems,
    selectedItemIds,
    handleDrop,
    rotateItem,
    deleteItem,
    selectItem,
    selectAll,
    deselectAll,
    duplicateItem,
    copyItems,
    pasteItems,
    deleteSelected,
    rotateSelected,
    updateItemCustomization,

    // BOM
    bomItems,

    // BOM extras
    extras,
    addExtra,
    setExtraQty,
    removeExtra,

    // Layout meta
    layoutMeta,
    handleSaveComplete,

    // Dirty state
    isDirty,

    // Ref images
    refImagePlacements,
    addRefImagePlacement,
    removeRefImagePlacement,
    updateRefImagePosition,
    updateRefImageScale,
    updateRefImageOpacity,
    updateRefImageRotation,
    toggleRefImageLock,
    applyRefImageAlignment,
    clearRefImageAlignment,
    referenceImagesForGrid,

    // Library
    libraryItems,
    isLibraryLoading,
    isLibrariesLoading,
    libraryError,
    librariesError,
    categories,
    getItemById,
    addCustomBin,
    placeCuratedBin,
    getLibraryMeta,

    // Layout actions
    loadLayout,
    handleClearAll,
    handleReset,

    // Dialogs
    dialogs,
    dialogDispatch,
    closeRebind,
    handleRebindSelect,
    confirmDialogProps,

    // Export
    exportPdfError,
    setExportPdfError,

    // Generation
    getGenerationEntry,
    trackGeneration,
    instanceGenerationHash,
    clearInstanceHash,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
