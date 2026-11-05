import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock WorkspaceContext
vi.mock('./contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkspace: () => ({
    layoutMeta: { id: null, name: '', status: null, owner: null, description: '' },
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
    width: 168,
    setWidth: vi.fn(),
    depth: 168,
    setDepth: vi.fn(),
    unitSystem: 'metric',
    imperialFormat: 'decimal',
    setImperialFormat: vi.fn(),
    setSpacerConfig: vi.fn(),
    handleUnitChange: vi.fn(),
    spacers: [],
    selectedItemIds: new Set(),
    handleDrop: vi.fn(),
    rotateItem: vi.fn(),
    deleteItem: vi.fn(),
    selectItem: vi.fn(),
    selectAll: vi.fn(),
    deselectAll: vi.fn(),
    duplicateItem: vi.fn(),
    copyItems: vi.fn(),
    pasteItems: vi.fn(),
    deleteSelected: vi.fn(),
    rotateSelected: vi.fn(),
    updateItemCustomization: vi.fn(),
    addRefImagePlacement: vi.fn(),
    removeRefImagePlacement: vi.fn(),
    updateRefImagePosition: vi.fn(),
    updateRefImageScale: vi.fn(),
    updateRefImageOpacity: vi.fn(),
    updateRefImageRotation: vi.fn(),
    toggleRefImageLock: vi.fn(),
    referenceImagesForGrid: [],
    libraryItems: [],
    isLibraryLoading: false,
    isLibrariesLoading: false,
    libraryError: null,
    librariesError: null,
    categories: [],
    getItemById: vi.fn(),
    getLibraryMeta: vi.fn(),
    loadLayout: vi.fn(),
    handleClearAll: vi.fn(),
    handleReset: vi.fn(),
    exportPdfError: null,
    setExportPdfError: vi.fn(),
  }),
}));

vi.mock('./contexts/CustomerContext', () => ({
  CustomerProvider: ({ children }: { children: React.ReactNode }) => children,
  useCustomers: () => ({
    customers: [],
    isLoading: false,
    selectedCustomer: null,
    setSelectedCustomerId: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
  }),
}));

vi.mock('./components/layouts/SaveLayoutDialog', () => ({ SaveLayoutDialog: () => null }));
vi.mock('./components/RebindImageDialog', () => ({ RebindImageDialog: () => null }));
vi.mock('./components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('./components/KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null }));

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
