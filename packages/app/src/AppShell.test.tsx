import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock WorkspaceContext
vi.mock('./contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkspace: () => ({
    isAuthenticated: false,
    isAdmin: false,
    layoutMeta: { id: null, name: '', status: null, owner: null, description: '' },
    isReadOnly: false,
    dialogs: { keyboard: false, save: false, rebind: false, admin: false, rebindTargetId: null },
    dialogDispatch: vi.fn(),
    closeRebind: vi.fn(),
    handleRebindSelect: vi.fn(),
    confirmDialogProps: { open: false, title: '', message: '', onConfirm: vi.fn(), onCancel: vi.fn() },
    bomItems: [],
    gridResult: { gridX: 4, gridY: 4, actualWidth: 168, actualDepth: 168, gapWidth: 0, gapDepth: 0 },
    placedItems: [],
    refImagePlacements: [],
    drawerWidth: 168,
    drawerDepth: 168,
    spacerConfig: { horizontal: 'none', vertical: 'none' },
    handleSaveComplete: vi.fn(),
    handleLoadLayout: vi.fn(),
    submittedCountQuery: { data: { submitted: 0 } },
    isWalkthroughActive: false,
    walkthroughCurrentStep: 0,
    walkthroughSteps: [],
    nextStep: vi.fn(),
    dismissTour: vi.fn(),
    // Additional fields from WorkspaceContextValue
    user: null,
    getAccessToken: vi.fn(),
    startTour: vi.fn(),
    width: 168,
    setWidth: vi.fn(),
    depth: 168,
    setDepth: vi.fn(),
    unitSystem: 'metric',
    setUnitSystem: vi.fn(),
    imperialFormat: 'decimal',
    setImperialFormat: vi.fn(),
    setSpacerConfig: vi.fn(),
    handleUnitChange: vi.fn(),
    spacers: [],
    selectedItemIds: new Set(),
    handleDrop: vi.fn(),
    rotateItem: vi.fn(),
    deleteItem: vi.fn(),
    clearAll: vi.fn(),
    loadItems: vi.fn(),
    selectItem: vi.fn(),
    selectAll: vi.fn(),
    deselectAll: vi.fn(),
    duplicateItem: vi.fn(),
    copyItems: vi.fn(),
    pasteItems: vi.fn(),
    deleteSelected: vi.fn(),
    rotateSelected: vi.fn(),
    updateItemCustomization: vi.fn(),
    handleSetStatus: vi.fn(),
    handleClearLayout: vi.fn(),
    addRefImagePlacement: vi.fn(),
    removeRefImagePlacement: vi.fn(),
    updateRefImagePosition: vi.fn(),
    updateRefImageScale: vi.fn(),
    updateRefImageOpacity: vi.fn(),
    updateRefImageRotation: vi.fn(),
    toggleRefImageLock: vi.fn(),
    rebindRefImage: vi.fn(),
    loadRefImagePlacements: vi.fn(),
    clearRefImages: vi.fn(),
    referenceImagesForGrid: [],
    libraryItems: [],
    isLibraryLoading: false,
    isLibrariesLoading: false,
    libraryError: null,
    librariesError: null,
    categories: [],
    getItemById: vi.fn(),
    getLibraryMeta: vi.fn(),
    refreshLibraries: vi.fn(),
    refreshLibrary: vi.fn(),
    selectedLibraryMeta: { customizableFields: [], customizationDefaults: {} },
    loadLayout: vi.fn(),
    handleSubmitLayout: vi.fn(),
    handleWithdrawLayout: vi.fn(),
    handleCloneCurrentLayout: vi.fn(),
    handleClearAll: vi.fn(),
    handleReset: vi.fn(),
    submitLayoutMutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
    withdrawLayoutMutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
    cloneLayoutMutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
    confirm: vi.fn(),
    exportPdfError: null,
    setExportPdfError: vi.fn(),
  }),
}));

vi.mock('./components/layouts/SaveLayoutDialog', () => ({ SaveLayoutDialog: () => null }));
vi.mock('./components/RebindImageDialog', () => ({ RebindImageDialog: () => null }));
vi.mock('./components/admin/AdminSubmissionsDialog', () => ({ AdminSubmissionsDialog: () => null }));
vi.mock('./components/admin/SubmissionsBadge', () => ({ SubmissionsBadge: () => null }));
vi.mock('./components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('./components/WalkthroughOverlay', () => ({ WalkthroughOverlay: () => null }));
vi.mock('./components/KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null }));
vi.mock('./components/auth/UserMenu', () => ({ UserMenu: () => null }));

import { AppShell } from './AppShell';

function renderShell() {
  render(<MemoryRouter><AppShell /></MemoryRouter>);
}

describe('AppShell status bar', () => {
  it('shows $0.00 cost estimate when no priced items', () => {
    renderShell();
    expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
  });
});
