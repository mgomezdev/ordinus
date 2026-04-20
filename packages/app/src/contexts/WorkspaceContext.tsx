import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type {
  UnitSystem, ImperialFormat, GridSpacerConfig, BOMItem, LibraryItem,
  LibraryMeta, DragData, BinCustomization, Category,
  GridResult, ReferenceImage, PlacedItem, PlacedItemWithValidity,
  ComputedSpacer, BOMExtras,
} from '../types/gridfinity';
import type { SelectModifiers } from '../hooks/useGridItems';
import type { LoadedLayoutConfig } from '../types/layoutConfig';
import type { ApiUser } from '@gridfinity/shared';
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
import { useRefImagePlacements } from '../hooks/useRefImagePlacements';
import { useAuth } from './AuthContext';
import { useWalkthrough, WALKTHROUGH_STEPS } from './WalkthroughContext';
import {
  useCloneLayoutMutation,
} from '../hooks/useLayouts';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useLayoutLoader } from '../hooks/useLayoutLoader';
import { useLayoutActions } from '../hooks/useLayoutActions';
import { STORAGE_KEYS } from '../utils/storageKeys';
import type { WalkthroughStep } from './WalkthroughContext';

// Re-export for convenience
export type { WalkthroughStep };

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
  // Dimensions
  width: number;
  setWidth: (w: number) => void;
  depth: number;
  setDepth: (d: number) => void;
  unitSystem: UnitSystem;
  setUnitSystem: (u: UnitSystem) => void;
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
  clearAll: () => void;
  loadItems: (items: PlacedItem[]) => void;
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
  clearExtras: () => void;

  // Layout meta
  layoutMeta: LayoutMetaState;
  handleSaveComplete: (layoutId: number, name: string) => void;
  handleClearLayout: () => void;

  // Ref images
  refImagePlacements: RefImagePlacement[];
  addRefImagePlacement: UseRefImagePlacementsReturn['addPlacement'];
  removeRefImagePlacement: UseRefImagePlacementsReturn['removePlacement'];
  updateRefImagePosition: UseRefImagePlacementsReturn['updatePosition'];
  updateRefImageScale: UseRefImagePlacementsReturn['updateScale'];
  updateRefImageOpacity: UseRefImagePlacementsReturn['updateOpacity'];
  updateRefImageRotation: UseRefImagePlacementsReturn['updateRotation'];
  toggleRefImageLock: UseRefImagePlacementsReturn['toggleLock'];
  rebindRefImage: UseRefImagePlacementsReturn['rebindImage'];
  loadRefImagePlacements: UseRefImagePlacementsReturn['loadPlacements'];
  clearRefImages: UseRefImagePlacementsReturn['clearAll'];
  referenceImagesForGrid: ReferenceImage[];

  // Library
  libraryItems: LibraryItem[];
  isLibraryLoading: boolean;
  isLibrariesLoading: boolean;
  libraryError: Error | null;
  librariesError: Error | null;
  categories: Category[];
  getItemById: (prefixedId: string) => LibraryItem | undefined;
  getLibraryMeta: (libraryId: string) => Promise<LibraryMeta>;
  refreshLibraries: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  selectedLibraryMeta: LibraryMeta;

  // Layout actions
  handleLoadLayout: (config: LoadedLayoutConfig) => void;
  loadLayout: (id: number) => Promise<void>;
  handleCloneCurrentLayout: () => Promise<void>;
  handleClearAll: () => Promise<void>;
  handleReset: () => void;

  // Mutations
  cloneLayoutMutation: ReturnType<typeof useCloneLayoutMutation>;

  // Dialogs
  dialogs: DialogState;
  dialogDispatch: React.Dispatch<DialogAction>;
  closeRebind: () => void;
  handleRebindSelect: (refImageId: number, imageUrl: string, name: string) => void;
  confirm: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'danger';
  }) => Promise<boolean>;
  confirmDialogProps: ConfirmDialogProps;

  // Auth
  isAuthenticated: boolean;
  user: ApiUser | null;
  isAdmin: boolean;
  getAccessToken: () => string | null;

  // Walkthrough
  isWalkthroughActive: boolean;
  walkthroughCurrentStep: number;
  walkthroughSteps: WalkthroughStep[];
  startTour: () => void;
  nextStep: () => void;
  dismissTour: () => void;

  // Export
  exportPdfError: string | null;
  setExportPdfError: (err: string | null) => void;
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
  const [selectedLibraryMeta, setSelectedLibraryMeta] = useState<LibraryMeta>({
    customizableFields: [],
    gridfinityExtendedParams: {},
  });

  // Hooks
  const { dialogs, dialogDispatch, closeRebind } = useDialogState();
  const {
    layoutMeta, layoutDispatch,
    handleSaveComplete: rawHandleSaveComplete,
    handleCloneComplete, handleClearLayout,
  } = useLayoutMeta();

  const { isAuthenticated, user, getAccessToken } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { isActive, currentStep, startTour, nextStep, dismissTour } = useWalkthrough();

  // Trigger walkthrough on first auth
  const prevAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthenticated && !prevAuthenticatedRef.current) {
      if (!localStorage.getItem(STORAGE_KEYS.WALKTHROUGH_SEEN)) {
        startTour();
      }
    }
    prevAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, startTour]);

  const cloneLayoutMutation = useCloneLayoutMutation();
  const { confirm, dialogProps: confirmDialogProps } = useConfirmDialog();

  // Library
  const {
    availableLibraries,
    isLoading: isLibrariesLoading,
    error: librariesError,
    refreshLibraries,
  } = useLibraries();

  const allLibraryIds = useMemo(() => availableLibraries.map(l => l.id), [availableLibraries]);

  const {
    items: libraryItems,
    isLoading: isLibraryLoading,
    error: libraryError,
    getItemById,
    getLibraryMeta,
    refreshLibrary,
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
    loadPlacements: loadRefImagePlacements,
    clearAll: clearRefImages,
  } = useRefImagePlacements();

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
    copyItems, pasteItems, deleteSelected, rotateSelected, updateItemCustomization,
  } = useGridItems(gridResult.gridX, gridResult.gridY, getItemById);

  const bomItems = useBillOfMaterials(placedItems, libraryItems);
  const { extras, addExtra, setExtraQty, removeExtra, clearExtras } = useBOMExtras();

  // Load library meta for the selected single item
  useEffect(() => {
    if (selectedItemIds.size !== 1) return;
    const selectedId = selectedItemIds.values().next().value as string;
    const selectedItem = placedItems.find(i => i.instanceId === selectedId);
    if (!selectedItem) return;
    const colonIdx = selectedItem.itemId.indexOf(':');
    if (colonIdx === -1) return;
    const libraryId = selectedItem.itemId.slice(0, colonIdx);
    getLibraryMeta(libraryId).then(setSelectedLibraryMeta).catch(() => {});
  }, [selectedItemIds, placedItems, getLibraryMeta]);

  // Convert ref image placements to ReferenceImage format for GridPreview
  const referenceImagesForGrid: ReferenceImage[] = useMemo(
    () =>
      refImagePlacements.map(p => ({
        id: p.id, name: p.name, dataUrl: '',
        x: p.x, y: p.y, width: p.width, height: p.height,
        opacity: p.opacity, scale: p.scale, isLocked: p.isLocked, rotation: p.rotation,
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

  const {
    handleSaveComplete,
    handleCloneCurrentLayout,
  } = useLayoutActions({
    layoutId: layoutMeta.id,
    cloneLayoutMutation,
    handleCloneComplete,
    rawHandleSaveComplete,
  });

  const { handleLoadLayout, loadLayout } = useLayoutLoader({
    unitSystem, setWidth, setDepth, setSpacerConfig,
    loadItems, loadRefImagePlacements, layoutDispatch, getAccessToken,
    clearExtras,
  });

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

  // Rebind image select handler
  const handleRebindSelect = useCallback((refImageId: number, imageUrl: string, name: string) => {
    if (dialogs.rebindTargetId) {
      rebindRefImage(dialogs.rebindTargetId, refImageId, imageUrl, name);
    }
    closeRebind();
  }, [dialogs.rebindTargetId, rebindRefImage, closeRebind]);

  const value: WorkspaceContextValue = {
    // Dimensions
    width,
    setWidth,
    depth,
    setDepth,
    unitSystem,
    setUnitSystem,
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
    clearAll,
    loadItems,
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
    clearExtras,

    // Layout meta
    layoutMeta,
    handleSaveComplete,
    handleClearLayout,

    // Ref images
    refImagePlacements,
    addRefImagePlacement,
    removeRefImagePlacement,
    updateRefImagePosition,
    updateRefImageScale,
    updateRefImageOpacity,
    updateRefImageRotation,
    toggleRefImageLock,
    rebindRefImage,
    loadRefImagePlacements,
    clearRefImages,
    referenceImagesForGrid,

    // Library
    libraryItems,
    isLibraryLoading,
    isLibrariesLoading,
    libraryError,
    librariesError,
    categories,
    getItemById,
    getLibraryMeta,
    refreshLibraries,
    refreshLibrary,
    selectedLibraryMeta,

    // Layout actions
    handleLoadLayout,
    loadLayout,
    handleCloneCurrentLayout,
    handleClearAll,
    handleReset,

    // Mutations
    cloneLayoutMutation,

    // Dialogs
    dialogs,
    dialogDispatch,
    closeRebind,
    handleRebindSelect,
    confirm,
    confirmDialogProps,

    // Auth
    isAuthenticated,
    user,
    isAdmin,
    getAccessToken,

    // Walkthrough
    isWalkthroughActive: isActive,
    walkthroughCurrentStep: currentStep,
    walkthroughSteps: WALKTHROUGH_STEPS,
    startTour,
    nextStep,
    dismissTour,

    // Export
    exportPdfError,
    setExportPdfError,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
