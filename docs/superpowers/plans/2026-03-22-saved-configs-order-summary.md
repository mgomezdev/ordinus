# Saved Configs & Order Summary Full Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Saved Configs modal and BOM panel into full-page views using React Router v6, with WorkspaceContext preserving grid state across navigation.

**Architecture:** Add react-router-dom v6 with three routes (`/`, `/configs`, `/order`) wrapped by a persistent `AppShell` that owns the nav bar, status bar, and global dialogs. `WorkspaceContext` lifts all shared workspace state above the router so it persists across navigation. `WorkspacePage` adds workspace-local UI state (zoom, panel widths) on top.

**Tech Stack:** React 19, TypeScript, react-router-dom v6, TanStack Query, Vitest, React Testing Library, jsPDF + jspdf-autotable (already installed)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/app/package.json` | Modify | Add react-router-dom v6 |
| `packages/app/src/types/gridfinity.ts` | Modify | Add `price?: number` to LibraryItem + BOMItem |
| `packages/app/src/hooks/useBillOfMaterials.ts` | Modify | Propagate price from LibraryItem → BOMItem |
| `packages/app/src/contexts/WorkspaceContext.tsx` | **Create** | All shared workspace state + actions |
| `packages/app/src/components/RequireAuth.tsx` | **Create** | Auth guard; redirects to `/?authRequired=1` |
| `packages/app/src/AppShell.tsx` | **Create** | Nav bar, status bar, global dialogs, `<Outlet>` |
| `packages/app/src/AppShell.css` | **Create** | Shell layout styles (moved from App.css nav/status sections) |
| `packages/app/src/App.tsx` | Modify | Thin: `<BrowserRouter>` + `<Routes>` only |
| `packages/app/src/App.test.tsx` | Modify | Update to test AppShell/WorkspacePage via MemoryRouter |
| `packages/app/src/pages/WorkspacePage.tsx` | **Create** | Current workspace UI + local UI state (zoom, panel widths, keyboard shortcuts) |
| `packages/app/src/pages/SavedConfigsPage.tsx` | **Create** | Full-page saved configs grid |
| `packages/app/src/pages/SavedConfigsPage.css` | **Create** | Card grid styles |
| `packages/app/src/components/layouts/SavedConfigCard.tsx` | **Create** | One card per saved layout |
| `packages/app/src/components/layouts/SavedConfigCard.test.tsx` | **Create** | Unit tests for card |
| `packages/app/src/utils/exportOrderSummaryPdf.ts` | **Create** | Data-only BOM PDF (no DOM capture needed) |
| `packages/app/src/utils/exportOrderSummaryPdf.test.ts` | **Create** | Unit tests |
| `packages/app/src/pages/OrderSummaryPage.tsx` | **Create** | Full-page order summary + BOM table |
| `packages/app/src/pages/OrderSummaryPage.css` | **Create** | Two-column layout + table + TBD chip styles |
| `packages/app/src/components/layouts/LoadLayoutDialog.tsx` | **Delete** | Replaced by SavedConfigsPage + WorkspaceContext.loadLayout |
| `packages/app/src/components/layouts/LayoutList.tsx` | **Delete** | Replaced by SavedConfigCard |

---

## Task 1: Install react-router-dom + add price to types

**Files:**
- Modify: `packages/app/package.json`
- Modify: `packages/app/src/types/gridfinity.ts`
- Modify: `packages/app/src/hooks/useBillOfMaterials.ts`
- Test: `packages/app/src/hooks/useBillOfMaterials.test.ts` (create if doesn't exist, or add to existing)

- [ ] **Step 1: Install react-router-dom**

```bash
cd packages/app && npm install react-router-dom
```

Expected: `react-router-dom` appears in `packages/app/package.json` dependencies.

- [ ] **Step 2: Write failing test for price propagation in useBillOfMaterials**

In `packages/app/src/hooks/useBillOfMaterials.test.ts`, add:

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBillOfMaterials } from './useBillOfMaterials';
import type { PlacedItem, LibraryItem } from '../types/gridfinity';

const BASE_ITEM: LibraryItem = {
  id: 'lib1:item1',
  name: 'Test Bin',
  widthUnits: 1,
  heightUnits: 1,
  color: '#ff0000',
  categories: ['bin'],
};

const PLACED: PlacedItem = {
  instanceId: 'p1',
  itemId: 'lib1:item1',
  x: 0, y: 0, width: 1, height: 1, rotation: 0,
};

it('propagates price from LibraryItem to BOMItem', () => {
  const { result } = renderHook(() =>
    useBillOfMaterials([PLACED], [{ ...BASE_ITEM, price: 12.50 }])
  );
  expect(result.current[0].price).toBe(12.50);
});

it('omits price when LibraryItem has no price', () => {
  const { result } = renderHook(() =>
    useBillOfMaterials([PLACED], [BASE_ITEM])
  );
  expect(result.current[0].price).toBeUndefined();
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/app && npx vitest run src/hooks/useBillOfMaterials.test.ts
```

Expected: FAIL — `price` does not exist on type

- [ ] **Step 4: Add `price?: number` to LibraryItem and BOMItem**

In `packages/app/src/types/gridfinity.ts`:

```typescript
// In LibraryItem interface, add after perspectiveImageUrl:
price?: number;

// In BOMItem interface, add after customization:
price?: number;
```

- [ ] **Step 5: Update useBillOfMaterials to propagate price**

In `packages/app/src/hooks/useBillOfMaterials.ts`, update the bomItems.push call:

```typescript
bomItems.push({
  itemId: libraryItem.id,
  name: libraryItem.name,
  widthUnits: libraryItem.widthUnits,
  heightUnits: libraryItem.heightUnits,
  color: libraryItem.color,
  categories: libraryItem.categories,
  quantity: count,
  customization,
  ...(libraryItem.price !== undefined ? { price: libraryItem.price } : {}),
});
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd packages/app && npx vitest run src/hooks/useBillOfMaterials.test.ts
```

Expected: PASS

- [ ] **Step 7: Run full suite to verify no regressions**

```bash
npm run test:run --workspace=packages/app
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add packages/app/package.json packages/app/package-lock.json packages/app/src/types/gridfinity.ts packages/app/src/hooks/useBillOfMaterials.ts packages/app/src/hooks/useBillOfMaterials.test.ts
git commit -m "feat(types): add price field to LibraryItem/BOMItem; install react-router-dom"
```

---

## Task 2: Create WorkspaceContext

**Background:** This context lifts all state that either AppShell (nav/status bar/global dialogs) or multiple pages need. WorkspacePage will consume it and add local-only UI state on top (zoom, panel widths, keyboard shortcuts). The context is placed inside `<BrowserRouter>` so it can use router hooks internally if needed, but above `<Outlet>` so it survives navigation.

**Files:**
- Create: `packages/app/src/contexts/WorkspaceContext.tsx`
- Modify: `packages/app/src/types/gridfinity.ts` (move/export LoadedLayoutConfig)

- [ ] **Step 1: Move LoadedLayoutConfig to gridfinity.ts**

`LoadedLayoutConfig` is currently exported from `LoadLayoutDialog.tsx` (which we'll delete). Move it to `packages/app/src/types/gridfinity.ts` so it can be imported by WorkspaceContext without a circular dep:

```typescript
// Add to packages/app/src/types/gridfinity.ts, at the bottom:
import type { LayoutStatus, PlacedItem, SpacerMode } from '@gridfinity/shared';

export interface LoadedLayoutConfig {
  layoutId: number;
  layoutName: string;
  layoutDescription: string | null;
  layoutStatus: LayoutStatus;
  widthMm: number;
  depthMm: number;
  spacerConfig: GridSpacerConfig;
  placedItems: PlacedItem[];
  refImagePlacements?: import('./hooks/useRefImagePlacements').RefImagePlacement[];
  ownerUsername?: string;
  ownerEmail?: string;
}
```

Note: to avoid circular imports, use a direct import path for `RefImagePlacement`. Check the actual import path — `RefImagePlacement` is defined in `packages/app/src/hooks/useRefImagePlacements.ts`.

Actually, put LoadedLayoutConfig in a dedicated file to avoid circular deps:

Create `packages/app/src/types/layoutConfig.ts`:
```typescript
import type { LayoutStatus } from '@gridfinity/shared';
import type { GridSpacerConfig } from './gridfinity';
import type { RefImagePlacement } from '../hooks/useRefImagePlacements';
// Re-export PlacedItem from shared
import type { PlacedItem } from '@gridfinity/shared';

export interface LoadedLayoutConfig {
  layoutId: number;
  layoutName: string;
  layoutDescription: string | null;
  layoutStatus: LayoutStatus;
  widthMm: number;
  depthMm: number;
  spacerConfig: GridSpacerConfig;
  placedItems: PlacedItem[];
  refImagePlacements?: RefImagePlacement[];
  ownerUsername?: string;
  ownerEmail?: string;
}
```

Update `packages/app/src/App.tsx` and any files that currently import `LoadedLayoutConfig` from `LoadLayoutDialog` to import from `'../types/layoutConfig'` instead.

- [ ] **Step 2: Create WorkspaceContext.tsx**

Create `packages/app/src/contexts/WorkspaceContext.tsx`. This file contains the `WorkspaceContext`, `WorkspaceProvider`, and `useWorkspace` hook. It essentially contains the body of the current `App.tsx` function (all hooks and derived values) minus the local UI state (zoom/pan/panel widths/keyboard shortcuts).

```typescript
import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type {
  UnitSystem, ImperialFormat, GridSpacerConfig, BOMItem, LibraryItem,
  LibraryMeta, DragData, PlacedItem, BinCustomization, Category,
  GridResult, ReferenceImage,
} from '../types/gridfinity';
import type { LoadedLayoutConfig } from '../types/layoutConfig';
import type { LayoutStatus } from '@gridfinity/shared';
import type { RefImagePlacement } from '../hooks/useRefImagePlacements';
import type { LayoutMetaState } from '../hooks/useLayoutMeta';
import type { DialogState, DialogAction } from '../reducers/dialogReducer';
import { calculateGrid, mmToInches, inchesToMm } from '../utils/conversions';
import { useLayoutMeta } from '../hooks/useLayoutMeta';
import { useDialogState } from '../hooks/useDialogState';
import { useGridItems } from '../hooks/useGridItems';
import { useSpacerCalculation } from '../hooks/useSpacerCalculation';
import { useBillOfMaterials } from '../hooks/useBillOfMaterials';
import { useLibraries } from '../hooks/useLibraries';
import { useLibraryData } from '../hooks/useLibraryData';
import { useCategoryData } from '../hooks/useCategoryData';
import { useRefImagePlacements } from '../hooks/useRefImagePlacements';
import { useAuth } from './AuthContext';
import { useWalkthrough, WALKTHROUGH_STEPS } from './WalkthroughContext';
import {
  useSubmitLayoutMutation, useWithdrawLayoutMutation,
  useCloneLayoutMutation, useSubmittedCountQuery,
} from '../hooks/useLayouts';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { fetchLayout } from '../api/layouts.api';
import { STORAGE_KEYS } from '../utils/storageKeys';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

// — helper moved from LoadLayoutDialog —
function apiToPlacedItems(detail: import('@gridfinity/shared').ApiLayoutDetail): PlacedItem[] {
  return detail.placedItems.map((item, index) => ({
    instanceId: `loaded-${index}`,
    itemId: `${item.libraryId}:${item.itemId}`,
    x: item.x, y: item.y, width: item.width, height: item.height,
    rotation: item.rotation as import('../types/gridfinity').Rotation,
    ...(item.customization ? { customization: item.customization } : {}),
  }));
}

export interface WorkspaceContextValue {
  // Dimensions
  width: number; depth: number;
  unitSystem: UnitSystem; imperialFormat: ImperialFormat;
  spacerConfig: GridSpacerConfig;
  setWidth: (v: number) => void; setDepth: (v: number) => void;
  handleUnitChange: (u: UnitSystem) => void;
  setImperialFormat: (f: ImperialFormat) => void;
  setSpacerConfig: (c: GridSpacerConfig) => void;
  // Derived grid
  gridResult: GridResult; drawerWidth: number; drawerDepth: number;
  spacers: import('../types/gridfinity').ComputedSpacer[];
  // Grid items
  placedItems: PlacedItem[];
  selectedItemIds: Set<string>;
  handleDrop: (d: DragData, x: number, y: number) => void;
  rotateItem: (id: string, dir: 'cw' | 'ccw') => void;
  deleteItem: (id: string) => void;
  clearAll: () => void;
  loadItems: (items: PlacedItem[]) => void;
  selectItem: (id: string | null, mods: { shift: boolean; meta: boolean }) => void;
  selectAll: () => void; deselectAll: () => void;
  duplicateItem: () => void; copyItems: () => void; pasteItems: () => void;
  deleteSelected: () => void;
  rotateSelected: (dir: 'cw' | 'ccw') => void;
  updateItemCustomization: (id: string, c: BinCustomization | undefined) => void;
  // BOM
  bomItems: BOMItem[];
  // Layout meta
  layoutMeta: LayoutMetaState;
  isReadOnly: boolean;
  handleSaveComplete: (id: number, name: string, status: LayoutStatus) => void;
  handleSetStatus: (status: LayoutStatus | null) => void;
  handleClearLayout: () => void;
  // Ref images
  refImagePlacements: RefImagePlacement[];
  addRefImagePlacement: (p: Omit<RefImagePlacement, 'id'>) => void;
  removeRefImagePlacement: (id: string) => void;
  updateRefImagePosition: (id: string, x: number, y: number) => void;
  updateRefImageScale: (id: string, s: number) => void;
  updateRefImageOpacity: (id: string, o: number) => void;
  updateRefImageRotation: (id: string, dir: 'cw' | 'ccw') => void;
  toggleRefImageLock: (id: string) => void;
  rebindRefImage: (id: string, refImageId: number, imageUrl: string, name: string) => void;
  loadRefImagePlacements: (placements: RefImagePlacement[]) => void;
  clearRefImages: () => void;
  referenceImagesForGrid: ReferenceImage[];
  refImageMetadata: Map<string, { isBroken: boolean; imageUrl: string | null }>;
  // Library
  libraryItems: LibraryItem[];
  isLibraryLoading: boolean; isLibrariesLoading: boolean;
  libraryError: Error | null; librariesError: Error | null;
  categories: Category[];
  getItemById: (id: string) => LibraryItem | undefined;
  getLibraryMeta: (libraryId: string) => Promise<LibraryMeta>;
  refreshLibraries: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
  // Layout actions
  handleLoadLayout: (config: LoadedLayoutConfig) => void;
  loadLayout: (id: number) => Promise<void>;
  handleSubmitClick: () => void;
  handleSubmitLayout: () => Promise<void>;
  handleWithdrawLayout: () => Promise<void>;
  handleCloneCurrentLayout: () => Promise<void>;
  handleClearAll: () => Promise<void>;
  handleReset: () => void;
  submitLayoutMutation: ReturnType<typeof useSubmitLayoutMutation>;
  withdrawLayoutMutation: ReturnType<typeof useWithdrawLayoutMutation>;
  cloneLayoutMutation: ReturnType<typeof useCloneLayoutMutation>;
  submittedCountQuery: ReturnType<typeof useSubmittedCountQuery>;
  // Dialogs
  dialogs: DialogState;
  dialogDispatch: React.Dispatch<DialogAction>;
  closeRebind: () => void;
  handleRebindSelect: (refImageId: number, imageUrl: string, name: string) => void;
  confirm: ReturnType<typeof useConfirmDialog>['confirm'];
  confirmDialogProps: ReturnType<typeof useConfirmDialog>['dialogProps'];
  // Auth
  isAuthenticated: boolean;
  user: ReturnType<typeof useAuth>['user'];
  isAdmin: boolean;
  // Walkthrough
  isWalkthroughActive: boolean;
  walkthroughCurrentStep: number;
  walkthroughSteps: typeof WALKTHROUGH_STEPS;
  startTour: () => void; nextStep: () => void; dismissTour: () => void;
  // Export
  exportPdfError: string | null;
  setExportPdfError: (e: string | null) => void;
  selectedLibraryMeta: LibraryMeta;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // — Dimensions —
  const [width, setWidth] = useState(168);
  const [depth, setDepth] = useState(168);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [imperialFormat, setImperialFormat] = useState<ImperialFormat>('decimal');
  const [spacerConfig, setSpacerConfig] = useState<GridSpacerConfig>({ horizontal: 'none', vertical: 'none' });
  const [exportPdfError, setExportPdfError] = useState<string | null>(null);
  const [selectedLibraryMeta, setSelectedLibraryMeta] = useState<LibraryMeta>({
    customizableFields: [], customizationDefaults: {},
  });

  const { dialogs, dialogDispatch, closeRebind } = useDialogState();
  const { layoutMeta, layoutDispatch, isReadOnly, handleSaveComplete, handleSetStatus, handleCloneComplete, handleLoadLayout: dispatchLoadLayout, handleClearLayout } = useLayoutMeta();
  const { isAuthenticated, user, getAccessToken } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { isActive: isWalkthroughActive, currentStep: walkthroughCurrentStep, startTour, nextStep, dismissTour } = useWalkthrough();
  const prevAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && !prevAuthenticatedRef.current) {
      if (!localStorage.getItem(STORAGE_KEYS.WALKTHROUGH_SEEN)) startTour();
    }
    prevAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, startTour]);

  const submitLayoutMutation = useSubmitLayoutMutation();
  const withdrawLayoutMutation = useWithdrawLayoutMutation();
  const cloneLayoutMutation = useCloneLayoutMutation();
  const submittedCountQuery = useSubmittedCountQuery();
  const { confirm, dialogProps: confirmDialogProps } = useConfirmDialog();

  // Library
  const { availableLibraries, isLoading: isLibrariesLoading, error: librariesError, refreshLibraries } = useLibraries();
  const allLibraryIds = availableLibraries.map(l => l.id);
  const { items: libraryItems, isLoading: isLibraryLoading, error: libraryError, getItemById, getLibraryMeta, refreshLibrary } = useLibraryData(allLibraryIds);
  const { categories } = useCategoryData(libraryItems);

  // Ref images
  const { placements: refImagePlacements, addPlacement: addRefImagePlacement, removePlacement: removeRefImagePlacement, updatePosition: updateRefImagePosition, updateScale: updateRefImageScale, updateOpacity: updateRefImageOpacity, updateRotation: updateRefImageRotation, toggleLock: toggleRefImageLock, rebindImage: rebindRefImage, loadPlacements: loadRefImagePlacements, clearAll: clearRefImages } = useRefImagePlacements();

  const handleRefreshAll = useCallback(async () => {
    try { await refreshLibraries(); await refreshLibrary(); } catch (err) { console.error('Library refresh failed:', err); }
  }, [refreshLibraries, refreshLibrary]);

  const handleUnitChange = (newUnit: UnitSystem) => {
    if (newUnit === unitSystem) return;
    if (newUnit === 'imperial') {
      setWidth(parseFloat(mmToInches(width).toFixed(4)));
      setDepth(parseFloat(mmToInches(depth).toFixed(4)));
    } else {
      setWidth(Math.round(inchesToMm(width)));
      setDepth(Math.round(inchesToMm(depth)));
    }
    setUnitSystem(newUnit);
  };

  const gridResult = useMemo(() => calculateGrid(width, depth, unitSystem), [width, depth, unitSystem]);
  const drawerWidth = unitSystem === 'metric' ? width : inchesToMm(width);
  const drawerDepth = unitSystem === 'metric' ? depth : inchesToMm(depth);
  const spacers = useSpacerCalculation(
    unitSystem === 'metric' ? gridResult.gapWidth : inchesToMm(gridResult.gapWidth),
    unitSystem === 'metric' ? gridResult.gapDepth : inchesToMm(gridResult.gapDepth),
    spacerConfig, drawerWidth, drawerDepth,
  );

  const { placedItems, selectedItemIds, rotateItem, deleteItem, clearAll, loadItems, selectItem, selectAll, deselectAll, handleDrop, duplicateItem, copyItems, pasteItems, deleteSelected, rotateSelected, updateItemCustomization } = useGridItems(gridResult.gridX, gridResult.gridY, getItemById);

  const bomItems = useBillOfMaterials(placedItems, libraryItems);

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

  const referenceImagesForGrid: ReferenceImage[] = useMemo(() =>
    refImagePlacements.map(p => ({
      id: p.id, name: p.name, dataUrl: '',
      x: p.x, y: p.y, width: p.width, height: p.height,
      opacity: p.opacity, scale: p.scale, isLocked: p.isLocked, rotation: p.rotation,
    })),
    [refImagePlacements]
  );

  const refImageMetadata = useMemo(() => {
    const map = new Map<string, { isBroken: boolean; imageUrl: string | null }>();
    for (const p of refImagePlacements) {
      map.set(p.id, { isBroken: p.refImageId === null, imageUrl: p.imageUrl ? `${API_BASE_URL}/images/${p.imageUrl}` : null });
    }
    return map;
  }, [refImagePlacements]);

  // — handleSubmitLayout —
  const handleSubmitLayout = useCallback(async () => {
    if (!layoutMeta.id) return;
    try {
      const result = await submitLayoutMutation.mutateAsync(layoutMeta.id);
      handleSetStatus(result.status);
    } catch { /* handled by mutation */ }
  }, [layoutMeta.id, submitLayoutMutation, handleSetStatus]);

  const submitAfterSaveRef = useRef(false);

  const handleSubmitClick = useCallback(() => {
    if (!layoutMeta.id) {
      submitAfterSaveRef.current = true;
      dialogDispatch({ type: 'OPEN', dialog: 'save' });
    } else {
      handleSubmitLayout();
    }
  }, [layoutMeta.id, dialogDispatch, handleSubmitLayout]);

  const handleSaveCompleteWithSubmit = useCallback((layoutId: number, name: string, status: LayoutStatus) => {
    handleSaveComplete(layoutId, name, status);
    if (submitAfterSaveRef.current) {
      submitAfterSaveRef.current = false;
      submitLayoutMutation.mutate(layoutId, { onSuccess: (result) => handleSetStatus(result.status) });
    }
  }, [handleSaveComplete, submitLayoutMutation, handleSetStatus]);

  const handleWithdrawLayout = useCallback(async () => {
    if (!layoutMeta.id) return;
    try {
      const result = await withdrawLayoutMutation.mutateAsync(layoutMeta.id);
      handleSetStatus(result.status);
    } catch { /* handled by mutation */ }
  }, [layoutMeta.id, withdrawLayoutMutation, handleSetStatus]);

  const handleCloneCurrentLayout = useCallback(async () => {
    if (!layoutMeta.id) return;
    try {
      const result = await cloneLayoutMutation.mutateAsync(layoutMeta.id);
      handleCloneComplete(result.id, result.name, result.status);
    } catch { /* handled by mutation */ }
  }, [layoutMeta.id, cloneLayoutMutation, handleCloneComplete]);

  // — handleLoadLayout (sync, from LoadedLayoutConfig) —
  const handleLoadLayout = useCallback((config: LoadedLayoutConfig) => {
    if (unitSystem === 'imperial') {
      setWidth(parseFloat(mmToInches(config.widthMm).toFixed(4)));
      setDepth(parseFloat(mmToInches(config.depthMm).toFixed(4)));
    } else {
      setWidth(config.widthMm);
      setDepth(config.depthMm);
    }
    setSpacerConfig(config.spacerConfig);
    loadItems(config.placedItems);
    loadRefImagePlacements(config.refImagePlacements ?? []);
    let owner = '';
    if (config.ownerUsername) {
      owner = config.ownerUsername;
      if (config.ownerEmail) owner += `<${config.ownerEmail}>`;
    }
    dispatchLoadLayout({ id: config.layoutId, name: config.layoutName, description: config.layoutDescription ?? '', status: config.layoutStatus, owner });
  }, [unitSystem, loadItems, loadRefImagePlacements, dispatchLoadLayout]);

  // — loadLayout (async, fetches from API by id) —
  const loadLayout = useCallback(async (id: number) => {
    const token = getAccessToken();
    if (!token) throw new Error('Not authenticated');
    const detail = await fetchLayout(token, id);
    const { PlacedItem: _, Rotation: __, SpacerMode: ___, ...rest } = await import('@gridfinity/shared');
    void rest;
    const placedItemsMapped = detail.placedItems.map((item, index) => ({
      instanceId: `loaded-${index}`,
      itemId: `${item.libraryId}:${item.itemId}`,
      x: item.x, y: item.y, width: item.width, height: item.height,
      rotation: item.rotation as import('../types/gridfinity').Rotation,
      ...(item.customization ? { customization: item.customization } : {}),
    }));
    const refPlacements: RefImagePlacement[] = (detail.refImagePlacements ?? []).map((p, index) => ({
      id: `loaded-ref-${index}`,
      refImageId: p.refImageId, name: p.name, imageUrl: p.imageUrl,
      x: p.x, y: p.y, width: p.width, height: p.height,
      opacity: p.opacity, scale: p.scale, isLocked: p.isLocked,
      rotation: p.rotation as import('../types/gridfinity').Rotation,
    }));
    handleLoadLayout({
      layoutId: detail.id, layoutName: detail.name, layoutDescription: detail.description,
      layoutStatus: detail.status, widthMm: detail.widthMm, depthMm: detail.depthMm,
      spacerConfig: { horizontal: detail.spacerHorizontal as import('../types/gridfinity').SpacerMode, vertical: detail.spacerVertical as import('../types/gridfinity').SpacerMode },
      placedItems: placedItemsMapped, refImagePlacements: refPlacements,
    });
  }, [getAccessToken, handleLoadLayout]);

  // — handleClearAll —
  const handleClearAll = useCallback(async () => {
    const message = refImagePlacements.length > 0
      ? `Remove all ${placedItems.length} placed items and ${refImagePlacements.length} reference images?`
      : `Remove all ${placedItems.length} placed items?`;
    if (await confirm({ title: 'Clear All', message, variant: 'danger', confirmLabel: 'Clear All', cancelLabel: 'Cancel' })) {
      clearAll(); clearRefImages(); handleClearLayout();
    }
  }, [refImagePlacements, placedItems, confirm, clearAll, clearRefImages, handleClearLayout]);

  const handleReset = useCallback(() => {
    setWidth(168); setDepth(168); setUnitSystem('metric');
    setSpacerConfig({ horizontal: 'none', vertical: 'none' });
  }, []);

  // — handleRebindSelect —
  const handleRebindSelect = useCallback((refImageId: number, imageUrl: string, name: string) => {
    if (dialogs.rebindTargetId) rebindRefImage(dialogs.rebindTargetId, refImageId, imageUrl, name);
    closeRebind();
  }, [dialogs.rebindTargetId, rebindRefImage, closeRebind]);

  const value: WorkspaceContextValue = {
    width, depth, unitSystem, imperialFormat, spacerConfig,
    setWidth, setDepth, handleUnitChange, setImperialFormat, setSpacerConfig,
    gridResult, drawerWidth, drawerDepth, spacers,
    placedItems, selectedItemIds, handleDrop, rotateItem, deleteItem, clearAll, loadItems,
    selectItem, selectAll, deselectAll, duplicateItem, copyItems, pasteItems,
    deleteSelected, rotateSelected, updateItemCustomization,
    bomItems,
    layoutMeta, isReadOnly, handleSaveComplete: handleSaveCompleteWithSubmit, handleSetStatus, handleClearLayout,
    refImagePlacements, addRefImagePlacement, removeRefImagePlacement,
    updateRefImagePosition, updateRefImageScale, updateRefImageOpacity,
    updateRefImageRotation, toggleRefImageLock, rebindRefImage, loadRefImagePlacements,
    clearRefImages, referenceImagesForGrid, refImageMetadata,
    libraryItems, isLibraryLoading, isLibrariesLoading,
    libraryError, librariesError, categories, getItemById, getLibraryMeta,
    refreshLibraries, refreshLibrary: handleRefreshAll,
    handleLoadLayout, loadLayout,
    handleSubmitClick, handleSubmitLayout, handleWithdrawLayout, handleCloneCurrentLayout,
    handleClearAll, handleReset,
    submitLayoutMutation, withdrawLayoutMutation, cloneLayoutMutation, submittedCountQuery,
    dialogs, dialogDispatch, closeRebind, handleRebindSelect,
    confirm, confirmDialogProps,
    isAuthenticated, user, isAdmin,
    isWalkthroughActive, walkthroughCurrentStep, walkthroughSteps: WALKTHROUGH_STEPS,
    startTour, nextStep, dismissTour,
    exportPdfError, setExportPdfError,
    selectedLibraryMeta,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/app && npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/contexts/WorkspaceContext.tsx packages/app/src/types/layoutConfig.ts packages/app/src/types/gridfinity.ts
git commit -m "feat(workspace): create WorkspaceContext with all shared state"
```

---

## Task 3: Create RequireAuth + AppShell

**Files:**
- Create: `packages/app/src/components/RequireAuth.tsx`
- Create: `packages/app/src/AppShell.tsx`
- Create: `packages/app/src/AppShell.css`

- [ ] **Step 1: Write failing tests for RequireAuth**

Create `packages/app/src/components/RequireAuth.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

let mockIsAuthenticated = false;
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));

function renderWithRouter(authenticated: boolean) {
  mockIsAuthenticated = authenticated;
  return render(
    <MemoryRouter initialEntries={['/configs']}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/configs" element={
          <RequireAuth>
            <div>Protected Content</div>
          </RequireAuth>
        } />
      </Routes>
    </MemoryRouter>
  );
}

it('renders children when authenticated', () => {
  renderWithRouter(true);
  expect(screen.getByText('Protected Content')).toBeInTheDocument();
});

it('redirects to /?authRequired=1 when not authenticated', () => {
  renderWithRouter(false);
  expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  expect(screen.getByText('Home')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/app && npx vitest run src/components/RequireAuth.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create RequireAuth**

Create `packages/app/src/components/RequireAuth.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={`/?authRequired=1`} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/app && npx vitest run src/components/RequireAuth.test.tsx
```

Expected: PASS

- [ ] **Step 5: Create AppShell.css**

Create `packages/app/src/AppShell.css` — move nav/status bar CSS out of App.css into this file. Copy the relevant rules from `App.css` (`.app-nav`, `.app-logo`, `.app-logo-icon`, `.app-logo-name`, `.app-logo-sub`, `.nav-tabs`, `.nav-tab`, `.nav-tab-active`, `.nav-end`, `.nav-layout-info`, `.nav-layout-name`, `.nav-layout-owner`, `.app-status-bar`, `.status-capacity`, `.status-dot`, `.status-cap-label`, `.status-bar-track`, `.status-bar-fill`, `.status-spacer`, `.status-count`, `.status-submit-btn`, `.keyboard-help-button`, `.read-only-banner`).

- [ ] **Step 6: Create AppShell.tsx**

Create `packages/app/src/AppShell.tsx`. This renders the persistent chrome and provides `WorkspaceProvider`. It reads from `useWorkspace()` for the nav bar, status bar, and global dialogs.

```tsx
import { Outlet, NavLink, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { SaveLayoutDialog } from './components/layouts/SaveLayoutDialog';
import { RebindImageDialog } from './components/RebindImageDialog';
import { AdminSubmissionsDialog } from './components/admin/AdminSubmissionsDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { WalkthroughOverlay } from './components/WalkthroughOverlay';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { UserMenu } from './components/auth/UserMenu';
import { SubmissionsBadge } from './components/admin/SubmissionsBadge';
import { useNavigate } from 'react-router-dom';
import './AppShell.css';

// Inner shell reads from context (must be inside WorkspaceProvider)
function AppShellInner() {
  const {
    isAuthenticated, isAdmin, layoutMeta, isReadOnly,
    dialogs, dialogDispatch, closeRebind, handleRebindSelect,
    confirm, confirmDialogProps,
    bomItems, gridResult, submitLayoutMutation,
    handleSubmitClick, handleLoadLayout,
    placedItems, refImagePlacements,
    drawerWidth, drawerDepth, spacerConfig, unitSystem,
    isWalkthroughActive, walkthroughCurrentStep, walkthroughSteps, nextStep, dismissTour,
    submittedCountQuery, handleSaveComplete, isLibraryLoading, isLibrariesLoading,
  } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open auth modal when redirected with ?authRequired=1
  useEffect(() => {
    if (searchParams.get('authRequired') === '1') {
      dialogDispatch({ type: 'OPEN', dialog: 'auth' });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, dialogDispatch]);

  const totalPlaced = bomItems.reduce((s, i) => s + i.quantity, 0);
  const capacity = gridResult.gridX * gridResult.gridY;
  const pct = capacity > 0 ? Math.min(100, Math.round((totalPlaced / capacity) * 100)) : 0;

  return (
    <div className="app">
      <h1 className="sr-only">Gridfinity Bin Customizer</h1>
      <nav className="app-nav">
        <div className="app-logo">
          <div className="app-logo-icon">G</div>
          <div>
            <div className="app-logo-name">GridfinityPlanner</div>
            <div className="app-logo-sub">Precision Architect</div>
          </div>
        </div>
        <div className="nav-tabs">
          <NavLink to="/" end className={({ isActive }) => `nav-tab${isActive ? ' nav-tab-active' : ''}`}>
            Workspace
          </NavLink>
          {isAuthenticated && (
            <NavLink to="/configs" className={({ isActive }) => `nav-tab${isActive ? ' nav-tab-active' : ''}`}>
              Saved Configs
            </NavLink>
          )}
        </div>
        <div className="nav-end">
          {layoutMeta.id && (
            <div className="nav-layout-info">
              {layoutMeta.owner && <span className="nav-layout-owner">{layoutMeta.owner} — </span>}
              <span className="nav-layout-name">{layoutMeta.name}</span>
              {layoutMeta.status && (
                <span className={`layout-status-badge layout-status-${layoutMeta.status}`}>{layoutMeta.status}</span>
              )}
            </div>
          )}
          <UserMenu />
          <button className="keyboard-help-button" onClick={() => dialogDispatch({ type: 'TOGGLE', dialog: 'keyboard' })} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</button>
        </div>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>

      <div className="app-status-bar">
        <div className="status-capacity">
          <span className="status-dot" />
          <span className="status-cap-label">Capacity: <strong>{pct}%</strong></span>
          <div className="status-bar-track"><div className="status-bar-fill" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="status-spacer" />
        <div className="status-count">
          <strong>{totalPlaced} item{totalPlaced !== 1 ? 's' : ''}</strong>
          {' · '}{gridResult.gridX}×{gridResult.gridY} grid
        </div>
        <div className="status-spacer" />
        {isAuthenticated && layoutMeta.status !== 'submitted' && layoutMeta.status !== 'delivered' && (
          <button
            className="status-submit-btn"
            onClick={() => navigate('/order')}
            type="button"
            disabled={totalPlaced === 0}
          >
            Review & Submit →
          </button>
        )}
      </div>

      {isReadOnly && <div className="read-only-banner">This layout has been delivered and is read-only. Clone to make changes.</div>}

      <KeyboardShortcutsHelp isOpen={dialogs.keyboard} onClose={() => dialogDispatch({ type: 'CLOSE', dialog: 'keyboard' })} />
      <SaveLayoutDialog
        isOpen={dialogs.save}
        onClose={() => dialogDispatch({ type: 'CLOSE', dialog: 'save' })}
        gridX={gridResult.gridX} gridY={gridResult.gridY}
        widthMm={drawerWidth} depthMm={drawerDepth}
        spacerConfig={spacerConfig} placedItems={placedItems}
        refImagePlacements={refImagePlacements}
        currentLayoutId={layoutMeta.id} currentLayoutName={layoutMeta.name}
        currentLayoutDescription={layoutMeta.description} currentLayoutStatus={layoutMeta.status}
        onSaveComplete={handleSaveComplete}
      />
      <RebindImageDialog isOpen={dialogs.rebind} onClose={() => dialogDispatch({ type: 'CLOSE_REBIND' })} onSelect={handleRebindSelect} />
      {isAdmin && (
        <AdminSubmissionsDialog isOpen={dialogs.admin} onClose={() => dialogDispatch({ type: 'CLOSE', dialog: 'admin' })} onLoad={handleLoadLayout} hasItems={placedItems.length > 0 || refImagePlacements.length > 0} />
      )}
      <ConfirmDialog {...confirmDialogProps} />
      <WalkthroughOverlay isActive={isWalkthroughActive} currentStep={walkthroughCurrentStep} steps={walkthroughSteps} onNext={nextStep} onDismiss={dismissTour} />
    </div>
  );
}

export function AppShell() {
  return (
    <WorkspaceProvider>
      <AppShellInner />
    </WorkspaceProvider>
  );
}
```

Note: You'll need to check whether `dialogs` has an `auth` dialog type in the dialog reducer. If not, add it. The `?authRequired=1` auto-open can also just open `UserMenu`'s existing auth modal — check how `AuthModal` is triggered in the current codebase and match that pattern.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd packages/app && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/components/RequireAuth.tsx packages/app/src/components/RequireAuth.test.tsx packages/app/src/AppShell.tsx packages/app/src/AppShell.css
git commit -m "feat(shell): create RequireAuth guard and AppShell with WorkspaceProvider"
```

---

## Task 4: Refactor App.tsx to thin router + create WorkspacePage

**Goal:** `App.tsx` becomes 20 lines. All current App.tsx JSX moves to `WorkspacePage.tsx`. Existing tests are migrated to test `WorkspacePage` via `MemoryRouter`.

**Files:**
- Modify: `packages/app/src/App.tsx`
- Create: `packages/app/src/pages/WorkspacePage.tsx`
- Modify: `packages/app/src/App.test.tsx`
- Modify: `packages/app/src/types/layoutConfig.ts` (update any re-exports)

- [ ] **Step 1: Create WorkspacePage.tsx**

Create `packages/app/src/pages/WorkspacePage.tsx`. This renders the sidebar, canvas, and library panel — consuming all state from `useWorkspace()`. It also owns local-only UI state: zoom/pan, image view mode, library panel width/tab, selected image, keyboard shortcuts.

Copy the JSX from the current `App.tsx` return statement into `WorkspacePage`. Replace all local state references with `useWorkspace()` calls. Keep local state (zoom, panel widths, keyboard shortcuts) inside `WorkspacePage`.

```tsx
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { ImageViewMode } from '../types/gridfinity';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useGridTransform } from '../hooks/useGridTransform';
import { exportToPdf } from '../utils/exportPdf';
import { GridPreview } from '../components/GridPreview';
import { GridSummary } from '../components/GridSummary';
import { ItemLibrary } from '../components/ItemLibrary';
import { ItemControls } from '../components/ItemControls';
import { BinCustomizationPanel } from '../components/BinCustomizationPanel';
import { SpacerControls } from '../components/SpacerControls';
import { BillOfMaterials } from '../components/BillOfMaterials';
import { RefImageLibrary } from '../components/RefImageLibrary';
import { ZoomControls } from '../components/ZoomControls';
import { ImageViewToggle } from '../components/ImageViewToggle';
import { GridViewport } from '../components/GridViewport';
import { SidebarPanel } from '../components/SidebarPanel';
import { DimensionInput } from '../components/DimensionInput';
import { SubmissionsBadge } from '../components/admin/SubmissionsBadge';
import { UserStlLibrarySection } from '../components/UserStlLibrarySection';
import { BinContextMenu } from '../components/BinContextMenu';

const LIBRARY_MIN_WIDTH = 160;
const LIBRARY_MAX_WIDTH = 520;
const LIBRARY_DEFAULT_WIDTH = 260;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

export function WorkspacePage() {
  const ws = useWorkspace();

  // Local UI state (not shared with other pages)
  const [imageViewMode, setImageViewMode] = useState<ImageViewMode>(
    () => (localStorage.getItem('gridfinity-image-view-mode') as ImageViewMode) || 'ortho'
  );
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<'items' | 'images'>('items');
  const [libraryCategory, setLibraryCategory] = useState<string | null>(null);
  const [libraryWidth, setLibraryWidth] = useState(LIBRARY_DEFAULT_WIDTH);
  const libraryDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isSpaceHeldRef = useRef(false);

  const { transform, zoomIn, zoomOut, resetZoom, fitToScreen, handleWheel, setZoomLevel, pan } = useGridTransform();

  // ... (keyboard shortcuts, handlers identical to current App.tsx local handlers)
  // Copy handleLibraryResizeStart, handleFitToScreen, toggleImageViewMode,
  // handleCombinedDrop, handleRemoveImage, handleRebindImage from current App.tsx

  // dimensionsContent and spacerContent JSX (same as current App.tsx)

  return (
    <>
      <SidebarPanel ... />
      <section className="preview"> ... </section>
      <div className="library-resize-handle" ... />
      <section className="library-panel" ... />
    </>
  );
}
```

Important: WorkspacePage does NOT render `<nav>`, `<div className="app-status-bar">`, or global dialogs — those are in AppShell.

- [ ] **Step 2: Refactor App.tsx to thin router setup**

Replace `packages/app/src/App.tsx` with:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './AppShell';
import { WorkspacePage } from './pages/WorkspacePage';
import { SavedConfigsPage } from './pages/SavedConfigsPage';
import { OrderSummaryPage } from './pages/OrderSummaryPage';
import { RequireAuth } from './components/RequireAuth';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<WorkspacePage />} />
          <Route path="configs" element={<RequireAuth><SavedConfigsPage /></RequireAuth>} />
          <Route path="order" element={<RequireAuth><OrderSummaryPage /></RequireAuth>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

Create stub files for the not-yet-implemented pages:

`packages/app/src/pages/SavedConfigsPage.tsx`:
```tsx
export function SavedConfigsPage() {
  return <div>Saved Configs (coming soon)</div>;
}
```

`packages/app/src/pages/OrderSummaryPage.tsx`:
```tsx
export function OrderSummaryPage() {
  return <div>Order Summary (coming soon)</div>;
}
```

- [ ] **Step 3: Update App.test.tsx**

App.test.tsx currently imports and renders `<App />` which tested the workspace UI. Now that App.tsx is a thin router and WorkspacePage has the UI, update the test file:

1. Change `import App from './App'` to `import { WorkspacePage } from './pages/WorkspacePage'`
2. Wrap renders in `MemoryRouter` + `WorkspaceProvider` (or mock `useWorkspace`)
3. Alternatively: mock `useWorkspace` to return the same mock values currently set up via hook mocks

The simplest migration: since the test mocks all the hooks that WorkspaceContext calls internally, create a `mockUseWorkspace` return value and mock `../contexts/WorkspaceContext`:

```typescript
vi.mock('./contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    width: 168, depth: 168, unitSystem: 'metric', imperialFormat: 'decimal',
    spacerConfig: { horizontal: 'none', vertical: 'none' },
    gridResult: { gridX: 4, gridY: 4, actualWidth: 168, actualDepth: 168, gapWidth: 0, gapDepth: 0 },
    placedItems: [], selectedItemIds: new Set(),
    bomItems: [], layoutMeta: { id: null, name: '', description: '', status: null, owner: '' },
    isReadOnly: false, isAuthenticated: false, isAdmin: false, user: null,
    categories: [], libraryItems: [], isLibraryLoading: false, isLibrariesLoading: false,
    libraryError: null, librariesError: null,
    refImagePlacements: [], referenceImagesForGrid: [], refImageMetadata: new Map(),
    dialogs: { save: false, load: false, keyboard: false, rebind: false, admin: false, auth: false, rebindTargetId: null },
    spacers: [], drawerWidth: 168, drawerDepth: 168, selectedLibraryMeta: { customizableFields: [], customizationDefaults: {} },
    exportPdfError: null,
    // All function props as vi.fn()
    setWidth: vi.fn(), setDepth: vi.fn(), handleUnitChange: vi.fn(),
    handleDrop: vi.fn(), rotateItem: vi.fn(), deleteItem: vi.fn(), clearAll: vi.fn(),
    loadItems: vi.fn(), selectItem: vi.fn(), selectAll: vi.fn(), deselectAll: vi.fn(),
    duplicateItem: vi.fn(), copyItems: vi.fn(), pasteItems: vi.fn(),
    deleteSelected: vi.fn(), rotateSelected: vi.fn(), updateItemCustomization: vi.fn(),
    handleClearAll: vi.fn(), handleReset: vi.fn(), handleSubmitClick: vi.fn(),
    handleLoadLayout: vi.fn(), loadLayout: vi.fn(), handleSubmitLayout: vi.fn(),
    dialogDispatch: vi.fn(), refreshLibraries: vi.fn(), refreshLibrary: vi.fn(),
    getItemById: vi.fn(), getLibraryMeta: vi.fn(),
    submitLayoutMutation: { isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() },
    addRefImagePlacement: vi.fn(), removeRefImagePlacement: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
    confirmDialogProps: { isOpen: false, title: '', message: '', onConfirm: vi.fn(), onCancel: vi.fn() },
  }),
}));
```

Then change renders from `render(<App />)` to `render(<WorkspacePage />)`.

- [ ] **Step 4: Run tests to verify**

```bash
npm run test:run --workspace=packages/app
```

Fix any failures. Expected: all pass.

- [ ] **Step 5: Verify the app still runs**

```bash
npm run dev --workspace=packages/app
```

Open http://localhost:5173 — workspace should work as before. Navigate to `/configs` — stub page visible. `/order` — stub page visible.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/App.tsx packages/app/src/App.test.tsx packages/app/src/pages/WorkspacePage.tsx packages/app/src/pages/SavedConfigsPage.tsx packages/app/src/pages/OrderSummaryPage.tsx
git commit -m "refactor(app): extract WorkspacePage; App.tsx becomes thin router"
```

---

## Task 5: Create SavedConfigCard + SavedConfigsPage; retire LoadLayoutDialog + LayoutList

**Files:**
- Create: `packages/app/src/components/layouts/SavedConfigCard.tsx`
- Create: `packages/app/src/components/layouts/SavedConfigCard.test.tsx`
- Modify: `packages/app/src/pages/SavedConfigsPage.tsx`
- Create: `packages/app/src/pages/SavedConfigsPage.css`
- Delete: `packages/app/src/components/layouts/LoadLayoutDialog.tsx`
- Delete: `packages/app/src/components/layouts/LayoutList.tsx`

- [ ] **Step 1: Write failing tests for SavedConfigCard**

Create `packages/app/src/components/layouts/SavedConfigCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SavedConfigCard } from './SavedConfigCard';
import type { ApiLayout } from '@gridfinity/shared';

const mockLayout: ApiLayout = {
  id: 1, name: 'My Layout', description: 'A test layout',
  status: 'draft', gridX: 4, gridY: 4,
  updatedAt: '2026-03-01T00:00:00Z',
  ownerUsername: 'testuser', ownerEmail: 'test@test.com',
};

const defaultProps = {
  layout: mockLayout,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onSubmit: vi.fn(),
  onWithdraw: vi.fn(),
  onDuplicate: vi.fn(),
  isDeleting: false,
};

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <SavedConfigCard {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('SavedConfigCard', () => {
  it('renders layout name', () => {
    renderCard();
    expect(screen.getByText('My Layout')).toBeInTheDocument();
  });

  it('renders grid dimensions in thumbnail', () => {
    renderCard();
    expect(screen.getByText('4×4')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    renderCard();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('shows Submit button for draft layouts', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('does not show Submit button for submitted layouts', () => {
    renderCard({ layout: { ...mockLayout, status: 'submitted' } });
    expect(screen.queryByRole('button', { name: /^submit$/i })).not.toBeInTheDocument();
  });

  it('shows Withdraw button for submitted layouts', () => {
    renderCard({ layout: { ...mockLayout, status: 'submitted' } });
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument();
  });

  it('does not show Delete button for delivered layouts', () => {
    renderCard({ layout: { ...mockLayout, status: 'delivered' } });
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit is clicked', () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it('requires two clicks to delete (confirm flow)', () => {
    const onDelete = vi.fn();
    renderCard({ onDelete });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/app && npx vitest run src/components/layouts/SavedConfigCard.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create SavedConfigCard.tsx**

Create `packages/app/src/components/layouts/SavedConfigCard.tsx`:

```tsx
import { useState } from 'react';
import type { ApiLayout } from '@gridfinity/shared';

interface SavedConfigCardProps {
  layout: ApiLayout;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onSubmit: (id: number) => void;
  onWithdraw: (id: number) => void;
  onDuplicate: (id: number) => void;
  isDeleting: boolean;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

export function SavedConfigCard({ layout, onEdit, onDelete, onSubmit, onWithdraw, onDuplicate, isDeleting }: SavedConfigCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="saved-config-card">
      {/* Thumbnail placeholder */}
      <div className="saved-config-thumbnail">
        <span className="saved-config-grid-dims">{layout.gridX}×{layout.gridY}</span>
      </div>

      <div className="saved-config-info">
        <div className="saved-config-name-row">
          <span className="saved-config-name">{layout.name}</span>
          <span className={`layout-status-badge layout-status-${layout.status}`}>{layout.status}</span>
        </div>
        <span className="saved-config-date">Saved {formatDate(layout.updatedAt)}</span>
      </div>

      <div className="saved-config-actions">
        <button className="saved-config-btn" onClick={() => onEdit(layout.id)} type="button">Edit</button>
        <button className="saved-config-btn" onClick={() => onDuplicate(layout.id)} type="button">Duplicate</button>
        {layout.status === 'draft' && (
          <button className="saved-config-btn saved-config-submit" onClick={() => onSubmit(layout.id)} type="button">Submit</button>
        )}
        {layout.status === 'submitted' && (
          <button className="saved-config-btn" onClick={() => onWithdraw(layout.id)} type="button">Withdraw</button>
        )}
        {layout.status !== 'delivered' && (
          confirmDelete ? (
            <button
              className="saved-config-btn saved-config-delete confirming"
              onClick={() => { onDelete(layout.id); setConfirmDelete(false); }}
              onBlur={() => setConfirmDelete(false)}
              disabled={isDeleting}
              type="button"
            >Confirm</button>
          ) : (
            <button
              className="saved-config-btn saved-config-delete"
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting}
              type="button"
            >Delete</button>
          )
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/app && npx vitest run src/components/layouts/SavedConfigCard.test.tsx
```

Expected: PASS

- [ ] **Step 5: Create SavedConfigsPage.css**

Create `packages/app/src/pages/SavedConfigsPage.css` with card grid and card styles:

```css
.saved-configs-page {
  padding: var(--space-xl);
  max-width: 1200px;
  margin: 0 auto;
}

.saved-configs-header { margin-bottom: var(--space-xl); }
.saved-configs-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin: 0 0 var(--space-xs); }
.saved-configs-subtitle { color: var(--text-secondary); font-size: 0.875rem; margin: 0; }

.saved-configs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-lg);
}

.saved-config-card {
  background: var(--surface);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.saved-config-thumbnail {
  background: var(--surface-variant);
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.saved-config-grid-dims {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.saved-config-info { padding: var(--space-md); border-bottom: 1px solid var(--border-primary); }
.saved-config-name-row { display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-xs); }
.saved-config-name { font-weight: 600; font-size: 0.9375rem; color: var(--text-primary); flex: 1; }
.saved-config-date { font-size: 0.75rem; color: var(--text-secondary); }

.saved-config-actions { padding: var(--space-sm) var(--space-md); display: flex; flex-wrap: wrap; gap: var(--space-xs); }
.saved-config-btn {
  padding: 4px 10px; border-radius: var(--radius-sm); font-size: 0.8125rem;
  border: 1px solid var(--border-primary); background: var(--surface); cursor: pointer;
  color: var(--text-primary); font-weight: 500;
}
.saved-config-btn:hover { background: var(--surface-variant); }
.saved-config-submit { background: var(--primary); color: #fff; border-color: var(--primary); }
.saved-config-submit:hover { opacity: 0.9; }
.saved-config-delete.confirming { background: var(--danger, #dc2626); color: #fff; border-color: var(--danger, #dc2626); }

/* New config card */
.saved-config-card.new-config {
  border-style: dashed;
  cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 220px; color: var(--text-secondary);
}
.saved-config-card.new-config:hover { background: var(--surface-variant); }
.saved-config-new-icon { font-size: 2rem; margin-bottom: var(--space-sm); }
.saved-config-new-label { font-weight: 600; font-size: 0.9375rem; }
.saved-config-new-hint { font-size: 0.8125rem; margin-top: var(--space-xs); }

/* Loading / empty states */
.saved-configs-loading, .saved-configs-empty { text-align: center; padding: var(--space-xl); color: var(--text-secondary); }
```

- [ ] **Step 6: Implement SavedConfigsPage.tsx**

Replace the stub in `packages/app/src/pages/SavedConfigsPage.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useLayoutsQuery, useDeleteLayoutMutation, useSubmitLayoutMutation, useWithdrawLayoutMutation, useCloneLayoutMutation } from '../hooks/useLayouts';
import { SavedConfigCard } from '../components/layouts/SavedConfigCard';
import './SavedConfigsPage.css';

export function SavedConfigsPage() {
  const navigate = useNavigate();
  const { loadLayout, handleClearAll } = useWorkspace();
  const layoutsQuery = useLayoutsQuery();
  const deleteMutation = useDeleteLayoutMutation();
  const submitMutation = useSubmitLayoutMutation();
  const withdrawMutation = useWithdrawLayoutMutation();
  const cloneMutation = useCloneLayoutMutation();

  const handleEdit = async (id: number) => {
    await loadLayout(id);
    navigate('/');
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const handleSubmit = async (id: number) => {
    await submitMutation.mutateAsync(id);
  };

  const handleWithdraw = async (id: number) => {
    await withdrawMutation.mutateAsync(id);
  };

  const handleDuplicate = async (id: number) => {
    await cloneMutation.mutateAsync(id);
  };

  const handleNewConfig = () => {
    // Clear the workspace state and navigate to workspace
    handleClearAll();
    navigate('/');
  };

  return (
    <div className="saved-configs-page">
      <div className="saved-configs-header">
        <h2 className="saved-configs-title">My Saved Configs</h2>
        <p className="saved-configs-subtitle">Review and manage your gridfinity layouts.</p>
      </div>

      {layoutsQuery.isLoading && <div className="saved-configs-loading">Loading layouts...</div>}

      {layoutsQuery.isError && (
        <div className="saved-configs-empty">{layoutsQuery.error?.message ?? 'Failed to load layouts'}</div>
      )}

      {!layoutsQuery.isLoading && !layoutsQuery.isError && (
        <div className="saved-configs-grid">
          {(layoutsQuery.data ?? []).map(layout => (
            <SavedConfigCard
              key={layout.id}
              layout={layout}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSubmit={handleSubmit}
              onWithdraw={handleWithdraw}
              onDuplicate={handleDuplicate}
              isDeleting={deleteMutation.isPending}
            />
          ))}

          <button className="saved-config-card new-config" onClick={handleNewConfig} type="button">
            <span className="saved-config-new-icon">+</span>
            <span className="saved-config-new-label">New Configuration</span>
            <span className="saved-config-new-hint">Start a fresh layout</span>
          </button>
        </div>
      )}

      {!layoutsQuery.isLoading && !layoutsQuery.isError && layoutsQuery.data?.length === 0 && (
        <div className="saved-configs-empty">
          <p>No saved layouts yet.</p>
          <button className="saved-config-btn saved-config-submit" onClick={() => navigate('/')} type="button">
            Start your first layout
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Delete LoadLayoutDialog.tsx and LayoutList.tsx**

```bash
rm packages/app/src/components/layouts/LoadLayoutDialog.tsx
rm packages/app/src/components/layouts/LayoutList.tsx
```

Update any imports of `LoadedLayoutConfig` from `LoadLayoutDialog` to import from `../types/layoutConfig` instead. Search with:
```bash
grep -r "LoadLayoutDialog\|LayoutList" packages/app/src --include="*.tsx" --include="*.ts"
```

Fix all remaining imports.

- [ ] **Step 8: Run full test suite**

```bash
npm run test:run --workspace=packages/app
```

Expected: all pass. Fix any failures caused by deleted files.

- [ ] **Step 9: Commit**

```bash
git add packages/app/src/components/layouts/ packages/app/src/pages/SavedConfigsPage.tsx packages/app/src/pages/SavedConfigsPage.css
git commit -m "feat(saved-configs): add SavedConfigCard and SavedConfigsPage; retire LoadLayoutDialog/LayoutList"
```

---

## Task 6: Create exportOrderSummaryPdf + OrderSummaryPage

**Files:**
- Create: `packages/app/src/utils/exportOrderSummaryPdf.ts`
- Create: `packages/app/src/utils/exportOrderSummaryPdf.test.ts`
- Modify: `packages/app/src/pages/OrderSummaryPage.tsx`
- Create: `packages/app/src/pages/OrderSummaryPage.css`

- [ ] **Step 1: Write failing tests for exportOrderSummaryPdf**

Create `packages/app/src/utils/exportOrderSummaryPdf.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { formatOrderSummaryRows, calculateOrderTotal } from './exportOrderSummaryPdf';
import type { BOMItem } from '../types/gridfinity';

const item1: BOMItem = {
  itemId: 'lib1:bin1', name: 'Small Bin', widthUnits: 1, heightUnits: 1,
  color: '#ff0000', categories: ['bin'], quantity: 3, price: 10.00,
};
const item2: BOMItem = {
  itemId: 'lib1:bin2', name: 'Large Bin', widthUnits: 2, heightUnits: 2,
  color: '#0000ff', categories: ['bin'], quantity: 2,
  // no price
};

describe('formatOrderSummaryRows', () => {
  it('formats row with price', () => {
    const rows = formatOrderSummaryRows([item1]);
    expect(rows[0]).toEqual(['Small Bin', '1×1', '3', '$10.00', '$30.00']);
  });

  it('shows TBD when no price', () => {
    const rows = formatOrderSummaryRows([item2]);
    expect(rows[0][3]).toBe('Price TBD');
    expect(rows[0][4]).toBe('—');
  });
});

describe('calculateOrderTotal', () => {
  it('sums only items with known prices', () => {
    expect(calculateOrderTotal([item1, item2])).toBe(30.00);
  });

  it('returns 0 when no items have prices', () => {
    expect(calculateOrderTotal([item2])).toBe(0);
  });

  it('returns true for hasTbd when any item has no price', () => {
    const { hasTbd } = calculateOrderTotal([item1, item2], true);
    expect(hasTbd).toBe(true);
  });
});
```

Note: `calculateOrderTotal` can be overloaded or return `{ total, hasTbd }` — pick one interface and implement it consistently.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/app && npx vitest run src/utils/exportOrderSummaryPdf.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create exportOrderSummaryPdf.ts**

Create `packages/app/src/utils/exportOrderSummaryPdf.ts`:

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BOMItem, GridResult, GridSpacerConfig, UnitSystem } from '../types/gridfinity';
import { generateFilename, getOrientation } from './exportPdf'; // reuse helpers

export function formatOrderSummaryRows(items: BOMItem[]): string[][] {
  return items.map(item => {
    const unitPrice = item.price !== undefined ? `$${item.price.toFixed(2)}` : 'Price TBD';
    const total = item.price !== undefined ? `$${(item.price * item.quantity).toFixed(2)}` : '—';
    return [item.name, `${item.widthUnits}×${item.heightUnits}`, String(item.quantity), unitPrice, total];
  });
}

export function calculateOrderTotal(items: BOMItem[]): number;
export function calculateOrderTotal(items: BOMItem[], includeHasTbd: true): { total: number; hasTbd: boolean };
export function calculateOrderTotal(items: BOMItem[], includeHasTbd?: true): number | { total: number; hasTbd: boolean } {
  const total = items.reduce((sum, item) => sum + (item.price !== undefined ? item.price * item.quantity : 0), 0);
  const hasTbd = items.some(item => item.price === undefined);
  if (includeHasTbd) return { total, hasTbd };
  return total;
}

export interface ExportOrderSummaryConfig {
  gridResult: GridResult;
  spacerConfig: GridSpacerConfig;
  unitSystem: UnitSystem;
  layoutName?: string;
}

export async function exportOrderSummaryPdf(
  bomItems: BOMItem[],
  config: ExportOrderSummaryConfig,
  onError?: (err: unknown) => void,
): Promise<void> {
  try {
    const { gridResult, spacerConfig, unitSystem, layoutName } = config;
    const orientation = getOrientation(gridResult.gridX, gridResult.gridY);
    const filename = generateFilename(layoutName);

    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let cursorY = margin;

    // Header
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Order Summary & BOM', margin, cursorY);
    if (layoutName) {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text(layoutName, margin, cursorY + 7);
    }
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(new Date().toLocaleDateString(), pageWidth - margin, cursorY, { align: 'right' });
    cursorY += layoutName ? 18 : 12;

    // Config block
    const unit = unitSystem === 'metric' ? 'mm' : 'in';
    const w = unitSystem === 'metric' ? Math.round(gridResult.actualWidth) : (gridResult.actualWidth / 25.4).toFixed(2);
    const d = unitSystem === 'metric' ? Math.round(gridResult.actualDepth) : (gridResult.actualDepth / 25.4).toFixed(2);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Drawer Dimensions', margin, cursorY);
    cursorY += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${w}${unit} × ${d}${unit}  ·  ${gridResult.gridX}×${gridResult.gridY} grid`, margin, cursorY);
    pdf.text(`Spacers: H ${spacerConfig.horizontal}, V ${spacerConfig.vertical}`, margin, cursorY + 5);
    cursorY += 13;

    // BOM table
    const { total, hasTbd } = calculateOrderTotal(bomItems, true);
    const totalQty = bomItems.reduce((sum, i) => sum + i.quantity, 0);

    autoTable(pdf, {
      startY: cursorY,
      head: [['Component', 'Size', 'Qty', 'Unit Price', 'Total']],
      body: [
        ...formatOrderSummaryRows(bomItems),
        [{ content: `${totalQty} item${totalQty !== 1 ? 's' : ''}`, colSpan: 2, styles: { fontStyle: 'bold' } },
         '', '', { content: hasTbd ? 'Pending quote' : `$${total.toFixed(2)}`, styles: { fontStyle: 'bold' } }],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 122, 255] },
    });

    if (hasTbd) {
      const finalY = (pdf as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY;
      pdf.setFontSize(8);
      pdf.setTextColor(180, 83, 9);
      pdf.text('† Items marked "Price TBD" will receive a confirmed quote before any build or shipment.', margin, finalY + 6);
      pdf.setTextColor(0, 0, 0);
    }

    pdf.save(filename);
  } catch (err) {
    console.error('Order summary PDF export failed:', err);
    onError?.(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/app && npx vitest run src/utils/exportOrderSummaryPdf.test.ts
```

Expected: PASS

- [ ] **Step 5: Create OrderSummaryPage.css**

Create `packages/app/src/pages/OrderSummaryPage.css`:

```css
.order-summary-page {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: var(--space-xl);
  padding: var(--space-xl);
  min-height: 0;
  align-items: start;
}

.order-summary-main { min-width: 0; }

.order-breadcrumb { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-secondary); margin-bottom: var(--space-md); }
.order-breadcrumb a { color: var(--text-secondary); text-decoration: none; }
.order-breadcrumb a:hover { color: var(--primary); }
.order-breadcrumb-sep { margin: 0 var(--space-xs); }

.order-summary-title { font-size: 1.5rem; font-weight: 700; margin: 0 0 var(--space-xs); color: var(--text-primary); }
.order-summary-subtitle { font-size: 0.875rem; color: var(--text-secondary); margin: 0 0 var(--space-xl); }

/* BOM table */
.order-bom-table { width: 100%; border-collapse: collapse; margin-bottom: var(--space-xl); }
.order-bom-table th { text-align: left; padding: var(--space-sm) var(--space-md); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); border-bottom: 2px solid var(--border-primary); }
.order-bom-table td { padding: var(--space-sm) var(--space-md); border-bottom: 1px solid var(--border-primary); vertical-align: middle; }
.order-bom-item-cell { display: flex; align-items: center; gap: var(--space-sm); }
.order-bom-color { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
.order-bom-name { font-weight: 500; font-size: 0.9375rem; }
.order-bom-size { font-size: 0.8125rem; color: var(--text-secondary); }

/* TBD chip */
.price-tbd-chip {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  background: #fef3c7; color: #b45309; font-size: 0.75rem; font-weight: 600;
}

/* Drawer info */
.order-drawer-info { margin-bottom: var(--space-xl); }
.order-drawer-info h3 { font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin: 0 0 var(--space-sm); }
.order-drawer-dims { font-size: 1.125rem; font-weight: 600; color: var(--text-primary); }

/* Capacity */
.order-capacity { margin-bottom: var(--space-xl); }
.order-capacity h3 { font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin: 0 0 var(--space-sm); }
.order-cap-bar { height: 8px; background: var(--surface-variant); border-radius: 4px; overflow: hidden; }
.order-cap-fill { height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.3s; }
.order-cap-label { font-size: 0.875rem; color: var(--text-secondary); margin-top: var(--space-xs); }

/* Right panel */
.order-summary-panel { background: var(--surface); border: 1px solid var(--border-primary); border-radius: var(--radius-md); padding: var(--space-lg); position: sticky; top: var(--space-xl); }
.order-panel-title { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 var(--space-md); }
.order-total-row { display: flex; justify-content: space-between; padding: var(--space-xs) 0; font-size: 0.9375rem; color: var(--text-primary); }
.order-total-row.grand { font-weight: 700; border-top: 2px solid var(--border-primary); padding-top: var(--space-sm); margin-top: var(--space-xs); }
.order-tbd-note { font-size: 0.75rem; color: #b45309; background: #fef3c7; padding: var(--space-sm); border-radius: var(--radius-sm); margin: var(--space-sm) 0; }
.order-panel-actions { margin-top: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-sm); }
.order-panel-btn { width: 100%; padding: 10px; border-radius: var(--radius-sm); font-size: 0.9375rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border-primary); background: var(--surface); color: var(--text-primary); }
.order-panel-btn:hover { background: var(--surface-variant); }
.order-panel-btn.primary { background: var(--primary); color: #fff; border-color: var(--primary); }
.order-panel-btn.primary:hover { opacity: 0.9; }
.order-panel-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.order-empty { text-align: center; padding: var(--space-xl); color: var(--text-secondary); }
```

- [ ] **Step 6: Implement OrderSummaryPage.tsx**

Replace the stub in `packages/app/src/pages/OrderSummaryPage.tsx`:

```tsx
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { exportOrderSummaryPdf, calculateOrderTotal } from '../utils/exportOrderSummaryPdf';
import './OrderSummaryPage.css';

export function OrderSummaryPage() {
  const navigate = useNavigate();
  const {
    bomItems, gridResult, spacerConfig, unitSystem, layoutMeta, isReadOnly,
    placedItems, drawerWidth, drawerDepth, submitLayoutMutation,
    handleSubmitLayout, dialogDispatch, handleSaveComplete, exportPdfError, setExportPdfError,
  } = useWorkspace();

  const totalPlaced = bomItems.reduce((s, i) => s + i.quantity, 0);
  const capacity = gridResult.gridX * gridResult.gridY;
  const pct = capacity > 0 ? Math.min(100, Math.round((totalPlaced / capacity) * 100)) : 0;
  const { total, hasTbd } = calculateOrderTotal(bomItems, true);
  const hasNoId = !layoutMeta.id;

  const handleDownloadPdf = async () => {
    setExportPdfError(null);
    await exportOrderSummaryPdf(
      bomItems,
      { gridResult, spacerConfig, unitSystem, layoutName: layoutMeta.name },
      () => setExportPdfError('PDF export failed. Please try again.'),
    );
  };

  const handleSubmit = async () => {
    await handleSubmitLayout();
    navigate('/configs');
  };

  const handleSaveAndExit = () => {
    dialogDispatch({ type: 'OPEN', dialog: 'save' });
    // SaveLayoutDialog's onSaveComplete is wired via WorkspaceContext; we navigate
    // after save via AppShell's existing onSaveComplete callback
  };

  return (
    <div className="order-summary-page">
      {/* Left column */}
      <div className="order-summary-main">
        <div className="order-breadcrumb">
          <Link to="/">Workspace</Link>
          <span className="order-breadcrumb-sep">›</span>
          <span>Order Summary</span>
        </div>

        <h2 className="order-summary-title">Order Summary &amp; BOM</h2>
        <p className="order-summary-subtitle">
          Review your layout before submitting. Items marked "Price TBD" will receive a confirmed quote before any build or shipment.
        </p>

        {hasNoId && (
          <div className="order-tbd-note">
            Save your layout first before submitting.
            <button className="saved-config-btn saved-config-submit" style={{ marginLeft: 8 }} onClick={handleSaveAndExit} type="button">Save Now</button>
          </div>
        )}

        {totalPlaced === 0 ? (
          <div className="order-empty">
            <p>No items placed yet.</p>
            <Link to="/">Return to workspace to add items.</Link>
          </div>
        ) : (
          <table className="order-bom-table">
            <thead>
              <tr>
                <th>Component Item</th>
                <th>Size</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {bomItems.map(item => (
                <tr key={`${item.itemId}-${item.customization ? JSON.stringify(item.customization) : ''}`}>
                  <td>
                    <div className="order-bom-item-cell">
                      <div className="order-bom-color" style={{ backgroundColor: item.color }} />
                      <div>
                        <div className="order-bom-name">{item.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="order-bom-size">{item.widthUnits}×{item.heightUnits}</td>
                  <td>{item.quantity}</td>
                  <td>
                    {item.price !== undefined
                      ? `$${item.price.toFixed(2)}`
                      : <span className="price-tbd-chip">Price TBD</span>
                    }
                  </td>
                  <td>{item.price !== undefined ? `$${(item.price * item.quantity).toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="order-drawer-info">
          <h3>Drawer Dimensions</h3>
          <div className="order-drawer-dims">{Math.round(drawerWidth)}mm × {Math.round(drawerDepth)}mm</div>
          <div className="order-cap-label">{gridResult.gridX}×{gridResult.gridY} grid</div>
        </div>

        <div className="order-capacity">
          <h3>Capacity</h3>
          <div className="order-cap-bar"><div className="order-cap-fill" style={{ width: `${pct}%` }} /></div>
          <div className="order-cap-label">{pct}% used</div>
        </div>

        {exportPdfError && <div role="alert" style={{ color: 'red', fontSize: '0.875rem' }}>{exportPdfError}</div>}
      </div>

      {/* Right panel */}
      <aside className="order-summary-panel">
        <p className="order-panel-title">Order Total</p>
        <div className="order-total-row"><span>Subtotal</span><span>${total.toFixed(2)}</span></div>
        {hasTbd && (
          <div className="order-tbd-note">
            † One or more items are Price TBD. A confirmed quote will follow before any build or shipment.
          </div>
        )}
        <div className="order-total-row grand">
          <span>Total</span>
          <span>{hasTbd ? 'Pending quote' : `$${total.toFixed(2)}`}</span>
        </div>

        <div className="order-panel-actions">
          <button className="order-panel-btn" onClick={handleDownloadPdf} type="button">
            Download PDF
          </button>
          {!isReadOnly && (
            <button
              className="order-panel-btn primary"
              onClick={handleSubmit}
              type="button"
              disabled={submitLayoutMutation.isPending || totalPlaced === 0 || hasNoId}
            >
              {submitLayoutMutation.isPending ? 'Submitting…' : 'Submit Layout'}
            </button>
          )}
          {isReadOnly && (
            <div style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              This layout has been fulfilled.
            </div>
          )}
          <button className="order-panel-btn" onClick={handleSaveAndExit} type="button">
            Save &amp; Exit
          </button>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 7: Run full test suite**

```bash
npm run test:run --workspace=packages/app
```

Expected: all pass.

- [ ] **Step 8: Manual smoke test**

```bash
npm run dev --workspace=packages/app
```

Verify:
- Workspace loads normally at `/`
- "Saved Configs" tab navigates to `/configs` (auth-gated: redirect to `/?authRequired=1` when logged out)
- "Review & Submit →" navigates to `/order`
- Order summary shows BOM table, capacity bar, panel
- Download PDF generates a PDF with BOM data

- [ ] **Step 9: Commit**

```bash
git add packages/app/src/utils/exportOrderSummaryPdf.ts packages/app/src/utils/exportOrderSummaryPdf.test.ts packages/app/src/pages/OrderSummaryPage.tsx packages/app/src/pages/OrderSummaryPage.css
git commit -m "feat(order-summary): add OrderSummaryPage with BOM table, pricing TBD, and PDF export"
```

---

## Final verification

- [ ] Run full test suite one more time:

```bash
npm run test:run --workspace=packages/app && npm run test --workspace=packages/server
```

- [ ] Run linter:

```bash
npm run lint
```

- [ ] Run E2E tests (if Docker container is available):

```bash
npm run test:e2e
```

Key E2E scenarios to verify manually if E2E suite is not run:
- Workspace drag-drop still works
- Save layout dialog still works
- Load layout from Saved Configs page
- Submit from Order Summary page
- PDF download from both workspace and order summary
