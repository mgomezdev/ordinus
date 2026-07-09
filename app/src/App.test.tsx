import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspacePage } from './pages/WorkspacePage';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { SaveLayoutDialog } from './components/layouts/SaveLayoutDialog';
import { RebindImageDialog } from './components/RebindImageDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import type { LibraryItem } from './types/gridfinity';
import type { RefImagePlacement } from './hooks/useRefImagePlacements';

// --- Captured callback props from mocked components ---
let capturedGridPreviewProps: Record<string, unknown> = {};
let capturedItemLibraryProps: Record<string, unknown> = {};
let capturedZoomControlsProps: Record<string, unknown> = {};

// --- Mock child components (shallow rendering) ---
vi.mock('./components/GridPreview', () => ({
  GridPreview: (props: Record<string, unknown>) => {
    capturedGridPreviewProps = props;
    return <div data-testid="grid-preview" />;
  },
}));

vi.mock('./components/ItemLibrary', () => ({
  ItemLibrary: (props: Record<string, unknown>) => {
    capturedItemLibraryProps = props;
    return <div data-testid="item-library" />;
  },
}));

vi.mock('./components/SpacerControls', () => ({
  SpacerControls: (props: Record<string, unknown>) => {
    return <div data-testid="spacer-controls" data-config={JSON.stringify(props.config)} />;
  },
}));

vi.mock('./components/RefImageLibrary', () => ({
  RefImageLibrary: () => <div data-testid="ref-image-library" />,
}));

vi.mock('./components/RebindImageDialog', () => ({
  RebindImageDialog: () => null,
}));

vi.mock('./components/ZoomControls', () => ({
  ZoomControls: (props: Record<string, unknown>) => {
    capturedZoomControlsProps = props;
    return <div data-testid="zoom-controls" />;
  },
}));

vi.mock('./components/ImageViewToggle', () => ({
  ImageViewToggle: (props: Record<string, unknown>) => {
    return <button data-testid="image-view-toggle" onClick={props.onToggle as () => void}>{props.mode === 'ortho' ? 'Top' : '3D'}</button>;
  },
}));

vi.mock('./components/KeyboardShortcutsHelp', () => ({
  KeyboardShortcutsHelp: (props: Record<string, unknown>) => {
    if (!props.isOpen) return null;
    return <div data-testid="keyboard-help-modal" />;
  },
}));

let capturedSaveLayoutDialogProps: Record<string, unknown> = {};
vi.mock('./components/layouts/SaveLayoutDialog', async (importOriginal) => {
  const original = await importOriginal<typeof import('./components/layouts/SaveLayoutDialog')>();
  return {
    ...original,
    SaveLayoutDialog: (props: Record<string, unknown>) => {
      capturedSaveLayoutDialogProps = props;
      return null;
    },
  };
});

vi.mock('./components/UserStlLibrarySection', () => ({
  UserStlLibrarySection: () => <div data-testid="user-stl-library-section" />,
}));

const mockUpdateMutateAsync = vi.fn();
vi.mock('./hooks/useLayouts', () => ({
  useCloneLayoutMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateLayoutMutation: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useSaveLayoutMutation: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
}));

vi.mock('./hooks/useFavorites', () => ({
  useFavorites: () => ({
    favorites: [],
    isLoading: false,
    isFavorite: vi.fn(() => false),
    toggleFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    renameFavorite: vi.fn(),
  }),
}));

vi.mock('./components/DimensionInput', () => ({
  DimensionInput: (props: Record<string, unknown>) => (
    <div data-testid={`dimension-input-${props.label}`} data-value={props.value} />
  ),
}));

vi.mock('./components/GridSummary', () => ({
  GridSummary: (props: Record<string, unknown>) => (
    <div data-testid="grid-summary" data-gridx={props.gridX} data-gridy={props.gridY} />
  ),
}));

// --- Mock network/storage hooks ---
const mockRefreshLibraries = vi.fn().mockResolvedValue(undefined);
const mockRefreshLibrary = vi.fn().mockResolvedValue(undefined);

vi.mock('./hooks/useLibraries', () => ({
  useLibraries: () => ({
    availableLibraries: [
      { id: 'bins_standard', name: 'Standard Bins', path: '/libraries/bins_standard/index.json', isEnabled: true },
    ],
    isLoading: false,
    error: null,
    refreshLibraries: mockRefreshLibraries,
  }),
}));

const testItem: LibraryItem = {
  id: 'bins_standard:bin-1x1',
  name: '1x1 Bin',
  widthUnits: 1,
  heightUnits: 1,
  color: '#646cff',
  categories: ['bin'],
};

const testItem2x1: LibraryItem = {
  id: 'bins_standard:bin-2x1',
  name: '2x1 Bin',
  widthUnits: 2,
  heightUnits: 1,
  color: '#646cff',
  categories: ['bin'],
};

const mockGetItemById = vi.fn((id: string): LibraryItem | undefined => {
  if (id === 'bins_standard:bin-1x1') return testItem;
  if (id === 'bins_standard:bin-2x1') return testItem2x1;
  return undefined;
});

const mockGetLibraryMeta = vi.fn().mockResolvedValue({ customizableFields: [], parameters: {} });
vi.mock('./hooks/useLibraryData', () => ({
  useLibraryData: () => ({
    items: [testItem, testItem2x1],
    isLoading: false,
    error: null,
    getItemById: mockGetItemById,
    getLibraryMeta: mockGetLibraryMeta,
    getItemsByCategory: () => [],
    getItemsByLibrary: () => [],
    refreshLibrary: mockRefreshLibrary,
  }),
}));

vi.mock('./hooks/useCategoryData', () => ({
  useCategoryData: () => ({
    categories: [{ id: 'bin', name: 'Bin' }],
    isLoading: false,
    error: null,
    getCategoryById: () => undefined,
  }),
}));

// Mock useRefImagePlacements - controllable per test
let mockPlacements: RefImagePlacement[] = [];
const mockRemovePlacement = vi.fn();
const mockUpdateRotation = vi.fn();
const mockToggleLock = vi.fn();
const mockClearRefImages = vi.fn();

vi.mock('./hooks/useRefImagePlacements', () => ({
  useRefImagePlacements: () => ({
    placements: mockPlacements,
    addPlacement: vi.fn(),
    removePlacement: mockRemovePlacement,
    updatePosition: vi.fn(),
    updateScale: vi.fn(),
    updateOpacity: vi.fn(),
    updateRotation: mockUpdateRotation,
    toggleLock: mockToggleLock,
    rebindImage: vi.fn(),
    loadPlacements: vi.fn(),
    clearAll: mockClearRefImages,
  }),
}));


// --- TestAppShell: renders global dialogs that AppShell provides in production ---
// WorkspacePage no longer renders these dialogs (they live in AppShell to avoid
// double-rendering). In tests we render WorkspacePage directly without AppShell,
// so we provide them here via a thin wrapper that reads from WorkspaceContext.
function TestAppShellInner({ children }: { children: React.ReactNode }) {
  const {
    dialogs, dialogDispatch, confirmDialogProps,
    gridResult, drawerWidth, drawerDepth, spacerConfig,
    placedItems, refImagePlacements, layoutMeta, handleSaveComplete,
    handleRebindSelect, closeRebind,
  } = useWorkspace();

  return (
    <>
      {children}
      <KeyboardShortcutsHelp
        isOpen={dialogs.keyboard}
        onClose={() => dialogDispatch({ type: 'CLOSE', dialog: 'keyboard' })}
      />
      <SaveLayoutDialog
        isOpen={dialogs.save}
        onClose={() => dialogDispatch({ type: 'CLOSE', dialog: 'save' })}
        gridX={gridResult.gridX}
        gridY={gridResult.gridY}
        widthMm={drawerWidth}
        depthMm={drawerDepth}
        spacerConfig={spacerConfig}
        placedItems={placedItems}
        refImagePlacements={refImagePlacements}
        currentLayoutId={layoutMeta.id}
        currentLayoutName={layoutMeta.name}
        currentLayoutDescription={layoutMeta.description}
        onSaveComplete={handleSaveComplete}
      />
      <RebindImageDialog
        isOpen={dialogs.rebind}
        onClose={closeRebind}
        onSelect={handleRebindSelect}
      />
      <ConfirmDialog {...confirmDialogProps} />
    </>
  );
}

// --- Helpers ---
function renderApp() {
  return render(
    <MemoryRouter>
      <WorkspaceProvider>
        <TestAppShellInner>
          <WorkspacePage />
        </TestAppShellInner>
      </WorkspaceProvider>
    </MemoryRouter>
  );
}

function placeItemViaGridPreview(itemId = 'bins_standard:bin-1x1', x = 0, y = 0) {
  const onDrop = capturedGridPreviewProps.onDrop as (data: { type: string; itemId: string }, x: number, y: number) => void;
  act(() => {
    onDrop({ type: 'library', itemId }, x, y);
  });
}

function selectItemViaGridPreview(instanceId: string) {
  const onSelectItem = capturedGridPreviewProps.onSelectItem as (id: string, mods?: Record<string, boolean>) => void;
  act(() => {
    onSelectItem(instanceId);
  });
}

function getPlacedItems(): Array<{ instanceId: string; itemId: string }> {
  return capturedGridPreviewProps.placedItems as Array<{ instanceId: string; itemId: string }>;
}

function getSelectedItemIds(): Set<string> {
  return capturedGridPreviewProps.selectedItemIds as Set<string>;
}

// --- Tests ---
describe('App Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedGridPreviewProps = {};
    capturedItemLibraryProps = {};
    capturedZoomControlsProps = {};
    capturedSaveLayoutDialogProps = {};
    mockPlacements = [];
    localStorage.removeItem('gridfinity-image-view-mode');
  });

  // ==========================================
  // 1. Renders correctly
  // ==========================================
  describe('Renders correctly', () => {
    it('renders metric unit toggle active by default', () => {
      renderApp();
      const mmButton = screen.getByText('mm');
      expect(mmButton).toHaveClass('active');
    });

    it('does not render imperial format toggle in metric mode', () => {
      renderApp();
      expect(screen.queryByText('.00')).not.toBeInTheDocument();
      expect(screen.queryByText('\u00BD')).not.toBeInTheDocument();
    });

    it('renders canvas breadcrumb with Workspace label', () => {
      renderApp();
      const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(breadcrumb).toBeInTheDocument();
      expect(breadcrumb).toHaveTextContent('Workspace');
    });
  });

  // ==========================================
  // 2. Unit Conversion
  // ==========================================
  describe('Unit Conversion - handleUnitChange', () => {
    it('switches to imperial and converts 168mm to ~6.6142 inches', () => {
      renderApp();
      const inButton = screen.getByText('in');
      fireEvent.click(inButton);

      const widthInput = screen.getByTestId('dimension-input-Width');
      const value = parseFloat(widthInput.getAttribute('data-value')!);
      expect(value).toBeCloseTo(6.6142, 3);
    });

    it('switches back to metric and rounds to nearest mm', () => {
      renderApp();
      // Switch to imperial
      fireEvent.click(screen.getByText('in'));
      // Switch back to metric
      fireEvent.click(screen.getByText('mm'));

      const widthInput = screen.getByTestId('dimension-input-Width');
      const value = parseFloat(widthInput.getAttribute('data-value')!);
      expect(Number.isInteger(value)).toBe(true);
    });

    it('maintains 4x4 grid through metric->imperial->metric round-trip', () => {
      renderApp();
      fireEvent.click(screen.getByText('in'));
      fireEvent.click(screen.getByText('mm'));

      const gridSummary = screen.getByTestId('grid-summary');
      expect(gridSummary.getAttribute('data-gridx')).toBe('4');
      expect(gridSummary.getAttribute('data-gridy')).toBe('4');
    });

    it('shows fractional format toggle only when imperial selected', () => {
      renderApp();
      expect(screen.queryByText('.00')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('in'));
      expect(screen.getByText('.00')).toBeInTheDocument();
      expect(screen.getByText('\u00BD')).toBeInTheDocument();
    });

    it('handles small mm value resulting in 0 grid units', () => {
      // We can't directly set width via DimensionInput (it's mocked),
      // but we can test the grid calculation pipeline via the summary
      renderApp();
      // Default is 168mm = 4 grid units, so just verify this baseline
      const gridSummary = screen.getByTestId('grid-summary');
      expect(Number(gridSummary.getAttribute('data-gridx'))).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================
  // 3. FIT Buttons
  // ==========================================
  describe('FIT buttons', () => {
    it('renders FIT W and FIT D buttons', () => {
      renderApp();
      expect(screen.getByRole('button', { name: /FIT W/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /FIT D/i })).toBeInTheDocument();
    });

    it('FIT W snaps width down to nearest 42mm multiple', () => {
      renderApp();
      // Default width is 168mm (exact fit). We can't change it through the mock,
      // but we can verify the button exists and clicking it when already at a
      // multiple of 42 keeps the same value (168 → 168).
      const widthDiv = screen.getByTestId('dimension-input-Width');
      const before = parseFloat(widthDiv.getAttribute('data-value')!);
      expect(before % 42).toBe(0); // already a multiple

      fireEvent.click(screen.getByRole('button', { name: /FIT W/i }));

      const after = parseFloat(widthDiv.getAttribute('data-value')!);
      expect(after % 42).toBe(0);
      expect(after).toBe(before); // 168 stays 168
    });

    it('FIT D snaps depth down to nearest 42mm multiple', () => {
      renderApp();
      const depthDiv = screen.getByTestId('dimension-input-Depth');
      const before = parseFloat(depthDiv.getAttribute('data-value')!);
      expect(before % 42).toBe(0);

      fireEvent.click(screen.getByRole('button', { name: /FIT D/i }));

      const after = parseFloat(depthDiv.getAttribute('data-value')!);
      expect(after % 42).toBe(0);
    });

    it('snap logic: floor(200/42)*42 === 168 and clamp ensures minimum of 42', () => {
      // DimensionInput is mocked as a static div so we cannot drive an arbitrary value
      // through the rendered UI. This test verifies the snap arithmetic directly.
      const UNIT = 42;
      expect(Math.max(UNIT, Math.floor(200 / UNIT) * UNIT)).toBe(168);
      expect(Math.max(UNIT, Math.floor(84 / UNIT) * UNIT)).toBe(84);
      // Without the clamp, a sub-42 input would produce 0; with it, the result is 42.
      expect(Math.max(UNIT, Math.floor(20 / UNIT) * UNIT)).toBe(42);
    });
  });

  // ==========================================
  // Save button states
  // ==========================================
  describe('Save button states', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows only Save button when layout is unsaved', () => {
      renderApp();
      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save as new/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /build from this/i })).not.toBeInTheDocument();
    });

    it('Save button is disabled when canvas is empty', () => {
      renderApp();
      expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    });

    it('shows Save Changes and Save as New when layout is saved (draft)', () => {
      renderApp();
      act(() => {
        const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
        onSaveComplete(10, 'My Layout', 'draft');
      });
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /save as new/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /build from this/i })).not.toBeInTheDocument();
    });

    it('Save Changes success shows Saved! toast that auto-dismisses', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockUpdateMutateAsync.mockResolvedValue({ id: 10, name: 'My Layout', status: 'draft' });
      renderApp();
      act(() => {
        const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
        onSaveComplete(10, 'My Layout', 'draft');
      });
      placeItemViaGridPreview();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      });
      expect(await screen.findByText('Saved!')).toBeInTheDocument();
      // Advance 1.5s — toast should auto-dismiss
      await act(async () => { vi.advanceTimersByTime(1500); });
      expect(screen.queryByText('Saved!')).not.toBeInTheDocument();
    });

    it('Save Changes error shows persistent error toast', async () => {
      mockUpdateMutateAsync.mockRejectedValue(new Error('Network error'));
      renderApp();
      act(() => {
        const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
        onSaveComplete(10, 'My Layout', 'draft');
      });
      placeItemViaGridPreview();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      });
      expect(await screen.findByText(/save failed/i)).toBeInTheDocument();
    });

    it('error toast dismiss button clears the toast', async () => {
      mockUpdateMutateAsync.mockRejectedValue(new Error('Network error'));
      renderApp();
      act(() => {
        const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
        onSaveComplete(10, 'My Layout', 'draft');
      });
      placeItemViaGridPreview();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      });
      await screen.findByText(/save failed/i);
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(screen.queryByText(/save failed/i)).not.toBeInTheDocument();
    });
  });

  // ==========================================
  // 4. Keyboard Shortcuts
  // ==========================================
  describe('Keyboard Shortcuts', () => {
    it('Delete with selectedImageId removes image, NOT items', () => {
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      // Place an item first
      placeItemViaGridPreview();
      const items = getPlacedItems();
      expect(items.length).toBe(1);

      // Select the image via GridPreview's onImageSelect
      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      // Fire Delete
      fireEvent.keyDown(document, { key: 'Delete' });

      // Image should be removed, items should remain
      expect(mockRemovePlacement).toHaveBeenCalledWith('img-1');
      expect(getPlacedItems().length).toBe(1);
    });

    it('Delete with selectedItemIds (no image) deletes items', () => {
      renderApp();
      placeItemViaGridPreview();
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);

      fireEvent.keyDown(document, { key: 'Delete' });

      expect(getPlacedItems().length).toBe(0);
    });

    it('Delete with no selection does nothing', () => {
      renderApp();
      placeItemViaGridPreview();

      // Deselect - click on empty area
      const onSelectItem = capturedGridPreviewProps.onSelectItem as (id: string | null) => void;
      act(() => { onSelectItem(null); });

      const itemsBefore = getPlacedItems().length;
      fireEvent.keyDown(document, { key: 'Delete' });
      expect(getPlacedItems().length).toBe(itemsBefore);
    });

    it('R with selectedImageId rotates image CW', () => {
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      fireEvent.keyDown(document, { key: 'r' });
      expect(mockUpdateRotation).toHaveBeenCalledWith('img-1', 'cw');
    });

    it('Shift+R with selectedImageId rotates image CCW', () => {
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      fireEvent.keyDown(document, { key: 'R', shiftKey: true });
      expect(mockUpdateRotation).toHaveBeenCalledWith('img-1', 'ccw');
    });

    it('R with selectedItemIds rotates items', () => {
      renderApp();
      placeItemViaGridPreview('bins_standard:bin-2x1', 0, 0);
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);

      const widthBefore = (getPlacedItems()[0] as unknown as { width: number }).width;
      fireEvent.keyDown(document, { key: 'r' });
      const widthAfter = (getPlacedItems()[0] as unknown as { width: number }).width;

      // 2x1 rotated CW becomes 1x2 - dimensions should swap
      expect(widthAfter).not.toBe(widthBefore);
    });

    it('Ctrl+D duplicates selected items', () => {
      renderApp();
      placeItemViaGridPreview();
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);

      fireEvent.keyDown(document, { key: 'd', ctrlKey: true });
      expect(getPlacedItems().length).toBe(2);
    });

    it('Ctrl+C / Ctrl+V copy/paste', () => {
      renderApp();
      placeItemViaGridPreview();
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);

      fireEvent.keyDown(document, { key: 'c', ctrlKey: true });
      fireEvent.keyDown(document, { key: 'v', ctrlKey: true });

      expect(getPlacedItems().length).toBe(2);
    });

    it('Escape clears both image and item selections', () => {
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      placeItemViaGridPreview();
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);
      expect(getSelectedItemIds().size).toBe(1);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(getSelectedItemIds().size).toBe(0);
      // selectedImageId is internal state; verify by checking that Delete after Escape does nothing
      expect(mockRemovePlacement).not.toHaveBeenCalled();
    });

    it('Escape clears selectedImageId when an image is selected (React 18 batching)', () => {
      // Verifies that deselectAll() and setSelectedImageId(null) are both applied
      // in a single render pass via React 18+ automatic batching.
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      // Select the image
      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      // Verify image is selected — R should rotate it
      fireEvent.keyDown(document, { key: 'r' });
      expect(mockUpdateRotation).toHaveBeenCalledWith('img-1', 'cw');
      mockUpdateRotation.mockClear();

      // Press Escape — should clear selectedImageId
      fireEvent.keyDown(document, { key: 'Escape' });

      // After Escape, R should NOT rotate the image (selectedImageId is null)
      fireEvent.keyDown(document, { key: 'r' });
      expect(mockUpdateRotation).not.toHaveBeenCalled();

      // Delete should also not remove any image
      fireEvent.keyDown(document, { key: 'Delete' });
      expect(mockRemovePlacement).not.toHaveBeenCalled();
    });

    it('Delete clears selectedImageId after removing image (no stale reference)', () => {
      // Verifies that removeRefImagePlacement() and setSelectedImageId(null)
      // are batched correctly — no stale image reference remains after deletion.
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      // Select the image
      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      // Delete the selected image
      fireEvent.keyDown(document, { key: 'Delete' });
      expect(mockRemovePlacement).toHaveBeenCalledWith('img-1');
      mockRemovePlacement.mockClear();

      // After deletion, pressing Delete again should NOT try to remove 'img-1' again
      fireEvent.keyDown(document, { key: 'Delete' });
      expect(mockRemovePlacement).not.toHaveBeenCalled();
    });

    it('Ctrl+A selects all placed items', () => {
      renderApp();
      placeItemViaGridPreview('bins_standard:bin-1x1', 0, 0);
      placeItemViaGridPreview('bins_standard:bin-1x1', 1, 0);
      placeItemViaGridPreview('bins_standard:bin-1x1', 2, 0);

      fireEvent.keyDown(document, { key: 'a', ctrlKey: true });
      expect(getSelectedItemIds().size).toBe(3);
    });

    it('L toggles lock on selected image', () => {
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      fireEvent.keyDown(document, { key: 'l' });
      expect(mockToggleLock).toHaveBeenCalledWith('img-1');
    });

    it('+/- zoom in/out', () => {
      renderApp();
      const zoomBefore = capturedZoomControlsProps.zoom as number;

      fireEvent.keyDown(document, { key: '+' });
      const zoomAfterPlus = capturedZoomControlsProps.zoom as number;
      expect(zoomAfterPlus).toBeGreaterThan(zoomBefore);

      fireEvent.keyDown(document, { key: '-' });
      const zoomAfterMinus = capturedZoomControlsProps.zoom as number;
      expect(zoomAfterMinus).toBeLessThan(zoomAfterPlus);
    });

    it('? toggles keyboard help modal', () => {
      renderApp();
      expect(screen.queryByTestId('keyboard-help-modal')).not.toBeInTheDocument();

      fireEvent.keyDown(document, { key: '?' });
      expect(screen.getByTestId('keyboard-help-modal')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: '?' });
      expect(screen.queryByTestId('keyboard-help-modal')).not.toBeInTheDocument();
    });

    it('shortcuts suppressed when focus is on INPUT element', () => {
      renderApp();
      placeItemViaGridPreview();
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);

      // Create and focus an input
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(document, { key: 'Delete' });
      // Items should NOT be deleted since focus is on input
      expect(getPlacedItems().length).toBe(1);

      document.body.removeChild(input);
    });

    it('Space sets grab cursor on viewport', () => {
      renderApp();
      const viewport = screen.getByTestId('preview-viewport');

      fireEvent.keyDown(document, { key: ' ' });
      expect(viewport.style.cursor).toBe('grab');

      fireEvent.keyUp(document, { key: ' ' });
      expect(viewport.style.cursor).toBe('');
    });

    it('V key toggles imageViewMode from ortho to perspective', () => {
      renderApp();
      expect(capturedGridPreviewProps.imageViewMode).toBe('ortho');

      fireEvent.keyDown(document, { key: 'v' });
      expect(capturedGridPreviewProps.imageViewMode).toBe('perspective');
    });

    it('V key toggles imageViewMode back to ortho', () => {
      renderApp();
      fireEvent.keyDown(document, { key: 'v' });
      expect(capturedGridPreviewProps.imageViewMode).toBe('perspective');

      fireEvent.keyDown(document, { key: 'v' });
      expect(capturedGridPreviewProps.imageViewMode).toBe('ortho');
    });

    it('V key does NOT toggle when Ctrl is held (Ctrl+V is paste)', () => {
      renderApp();
      placeItemViaGridPreview();
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);

      fireEvent.keyDown(document, { key: 'c', ctrlKey: true });
      fireEvent.keyDown(document, { key: 'v', ctrlKey: true });

      // Should still be ortho (Ctrl+V is paste, not view toggle)
      expect(capturedGridPreviewProps.imageViewMode).toBe('ortho');
    });

    it('V key does NOT toggle when focus is on INPUT', () => {
      renderApp();

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      fireEvent.keyDown(document, { key: 'v' });
      expect(capturedGridPreviewProps.imageViewMode).toBe('ortho');

      document.body.removeChild(input);
    });
  });

  // ==========================================
  // 4. Selection Coordination
  // ==========================================
  describe('Selection Coordination', () => {
    it('onImageSelect clears item selection', () => {
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      placeItemViaGridPreview();
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);
      expect(getSelectedItemIds().size).toBe(1);

      // Select image - should deselect items
      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });
      expect(getSelectedItemIds().size).toBe(0);
    });

    it('onSelectItem with truthy id clears selectedImageId', () => {
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      // Select image first
      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      // Now place and select an item
      placeItemViaGridPreview();
      const instanceId = getPlacedItems()[0].instanceId;
      selectItemViaGridPreview(instanceId);

      // Pressing R should rotate the item, not the image
      fireEvent.keyDown(document, { key: 'r' });
      expect(mockUpdateRotation).not.toHaveBeenCalled();
    });

    it('handleRemoveImage clears selectedImageId when removing selected image', () => {
      mockPlacements = [{
        id: 'img-1', refImageId: 1, name: 'test.png', imageUrl: 'ref-lib/test.webp',
        x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
      }];
      renderApp();

      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      // Remove the selected image via the callback
      const onImageRemove = capturedGridPreviewProps.onImageRemove as (id: string) => void;
      act(() => { onImageRemove('img-1'); });

      expect(mockRemovePlacement).toHaveBeenCalledWith('img-1');
      // After removal, Delete should not try to remove 'img-1' again
      mockRemovePlacement.mockClear();
      fireEvent.keyDown(document, { key: 'Delete' });
      expect(mockRemovePlacement).not.toHaveBeenCalled();
    });

    it('handleRemoveImage does NOT clear selectedImageId for different image', () => {
      mockPlacements = [
        {
          id: 'img-1', refImageId: 1, name: 'test1.png', imageUrl: 'ref-lib/test1.webp',
          x: 0, y: 0, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
        },
        {
          id: 'img-2', refImageId: 2, name: 'test2.png', imageUrl: 'ref-lib/test2.webp',
          x: 10, y: 10, width: 50, height: 50, opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
        },
      ];
      renderApp();

      // Select img-1
      const onImageSelect = capturedGridPreviewProps.onImageSelect as (id: string) => void;
      act(() => { onImageSelect('img-1'); });

      // Remove img-2 (different from selected)
      const onImageRemove = capturedGridPreviewProps.onImageRemove as (id: string) => void;
      act(() => { onImageRemove('img-2'); });

      // img-1 should still be selected; Delete should remove img-1
      mockRemovePlacement.mockClear();
      fireEvent.keyDown(document, { key: 'Delete' });
      expect(mockRemovePlacement).toHaveBeenCalledWith('img-1');
    });
  });

  // ==========================================
  // 5. Component Composition
  // ==========================================
  describe('Component Composition', () => {
    it('GridPreview receives gridX/gridY from calculateGrid', () => {
      renderApp();
      expect(capturedGridPreviewProps.gridX).toBe(4);
      expect(capturedGridPreviewProps.gridY).toBe(4);
    });

    it('ItemLibrary receives merged loading state', () => {
      renderApp();
      // Both isLibraryLoading and isLibrariesLoading are false in our mocks
      expect(capturedItemLibraryProps.isLoading).toBe(false);
    });

    it('Clear All button renders only when placedItems.length > 0', () => {
      renderApp();
      expect(screen.queryByText(/Clear All/)).not.toBeInTheDocument();

      placeItemViaGridPreview();
      expect(screen.getByText(/Clear All/)).toBeInTheDocument();
    });

    it('Clear All with confirm=true calls clearAll', async () => {
      renderApp();
      placeItemViaGridPreview();
      expect(getPlacedItems().length).toBe(1);

      fireEvent.click(screen.getByText(/Clear All/));
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
      await waitFor(() => {
        expect(getPlacedItems().length).toBe(0);
      });
    });

    it('Clear All with confirm=false does not clear', async () => {
      renderApp();
      placeItemViaGridPreview();
      expect(getPlacedItems().length).toBe(1);

      fireEvent.click(screen.getByText(/Clear All/));
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(getPlacedItems().length).toBe(1);
    });

    it('ZoomControls receives zoom from useGridTransform', () => {
      renderApp();
      expect(capturedZoomControlsProps.zoom).toBe(1);
    });

    it('ImageViewToggle is rendered in the toolbar', () => {
      renderApp();
      expect(screen.getByTestId('image-view-toggle')).toBeInTheDocument();
    });

    it('GridPreview receives imageViewMode prop', () => {
      renderApp();
      expect(capturedGridPreviewProps.imageViewMode).toBe('ortho');
    });

    it('clicking ImageViewToggle toggles imageViewMode on GridPreview', () => {
      renderApp();
      expect(capturedGridPreviewProps.imageViewMode).toBe('ortho');

      fireEvent.click(screen.getByTestId('image-view-toggle'));
      expect(capturedGridPreviewProps.imageViewMode).toBe('perspective');

      fireEvent.click(screen.getByTestId('image-view-toggle'));
      expect(capturedGridPreviewProps.imageViewMode).toBe('ortho');
    });
  });

  // ==========================================
  // 6. Grid Calculation Pipeline
  // ==========================================
  describe('Grid Calculation Pipeline', () => {
    it('default 168x168mm -> 4x4 grid', () => {
      renderApp();
      const summary = screen.getByTestId('grid-summary');
      expect(summary.getAttribute('data-gridx')).toBe('4');
      expect(summary.getAttribute('data-gridy')).toBe('4');
    });

    it('GridPreview receives correct grid dimensions', () => {
      renderApp();
      // Default 168mm / 42mm = 4 units
      expect(capturedGridPreviewProps.gridX).toBe(4);
      expect(capturedGridPreviewProps.gridY).toBe(4);
    });

    it('grid calculation is consistent between GridPreview and GridSummary', () => {
      renderApp();
      const summary = screen.getByTestId('grid-summary');
      const summaryX = Number(summary.getAttribute('data-gridx'));
      const summaryY = Number(summary.getAttribute('data-gridy'));
      expect(capturedGridPreviewProps.gridX).toBe(summaryX);
      expect(capturedGridPreviewProps.gridY).toBe(summaryY);
    });

    it('grid values are non-negative integers', () => {
      renderApp();
      const gridX = capturedGridPreviewProps.gridX as number;
      const gridY = capturedGridPreviewProps.gridY as number;
      expect(gridX).toBeGreaterThanOrEqual(0);
      expect(gridY).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(gridX)).toBe(true);
      expect(Number.isInteger(gridY)).toBe(true);
    });
  });


  // ==========================================
  // 11. isDirty breadcrumb indicator
  // ==========================================
  describe('isDirty breadcrumb indicator', () => {
    it('does not show unsaved indicator on a fresh canvas with no saved layout', () => {
      renderApp();
      expect(screen.queryByText('unsaved changes')).not.toBeInTheDocument();
    });

    it('does not show unsaved indicator immediately after save completes', async () => {
      renderApp();
      // Simulate a successful save (sets layoutMeta.id)
      act(() => {
        const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string) => void;
        onSaveComplete(42, 'My Drawer');
      });
      expect(screen.queryByText('unsaved changes')).not.toBeInTheDocument();
    });

    it('shows unsaved indicator after placing an item on a saved layout', async () => {
      renderApp();
      act(() => {
        const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string) => void;
        onSaveComplete(42, 'My Drawer');
      });
      placeItemViaGridPreview();
      await waitFor(() => {
        expect(screen.getByText('unsaved changes')).toBeInTheDocument();
      });
    });

    it('hides unsaved indicator after saving again', async () => {
      renderApp();
      act(() => {
        const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string) => void;
        onSaveComplete(42, 'My Drawer');
      });
      placeItemViaGridPreview();
      await waitFor(() => {
        expect(screen.getByText('unsaved changes')).toBeInTheDocument();
      });
      // Save again
      mockUpdateMutateAsync.mockResolvedValueOnce({ id: 42, name: 'My Drawer' });
      act(() => {
        const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string) => void;
        onSaveComplete(42, 'My Drawer');
      });
      await waitFor(() => {
        expect(screen.queryByText('unsaved changes')).not.toBeInTheDocument();
      });
    });
  });

});
