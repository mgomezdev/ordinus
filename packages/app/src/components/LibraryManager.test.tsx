import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LibraryManager } from './LibraryManager';
import type { LibraryItem, Category } from '../types/gridfinity';

const defaultCategories: Category[] = [
  { id: 'bin', name: 'Bin', color: '#3B82F6' },
  { id: 'utensil', name: 'Utensil', color: '#10B981' },
];

const defaultItems: LibraryItem[] = [
  {
    id: 'bin-1x1',
    libraryId: 'default',
    name: '1x1 Bin',
    widthUnits: 1,
    heightUnits: 1,
    color: '#3B82F6',
    categories: ['bin'],
    imageUrl: '/images/bin-1x1.png',
  },
  {
    id: 'bin-2x2',
    libraryId: 'default',
    name: '2x2 Bin',
    widthUnits: 2,
    heightUnits: 2,
    color: '#3B82F6',
    categories: ['bin'],
  },
];

function buildProps(overrides: Partial<Parameters<typeof LibraryManager>[0]> = {}) {
  return {
    items: defaultItems,
    categories: defaultCategories,
    onClose: vi.fn(),
    onAddItem: vi.fn(),
    onUpdateItem: vi.fn(),
    onDeleteItem: vi.fn(),
    onResetToDefaults: vi.fn(),
    onAddCategory: vi.fn(),
    onUpdateCategory: vi.fn(),
    onDeleteCategory: vi.fn(),
    onResetCategories: vi.fn(),
    onUpdateItemCategories: vi.fn(),
    getCategoryById: (id: string) => defaultCategories.find(c => c.id === id),
    ...overrides,
  };
}

describe('LibraryManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // Rendering / initial state
  // -------------------------------------------------------------------
  describe('Initial rendering', () => {
    it('renders the dialog with aria-label "Manage Library"', () => {
      render(<LibraryManager {...buildProps()} />);
      expect(screen.getByRole('dialog', { name: 'Manage Library' })).toBeInTheDocument();
    });

    it('renders the "Manage Library" heading', () => {
      render(<LibraryManager {...buildProps()} />);
      expect(screen.getByRole('heading', { name: /manage library/i })).toBeInTheDocument();
    });

    it('renders the close button', () => {
      render(<LibraryManager {...buildProps()} />);
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('renders the item count in the list heading', () => {
      render(<LibraryManager {...buildProps()} />);
      expect(screen.getByText(`Library Items (${defaultItems.length})`)).toBeInTheDocument();
    });

    it('renders each library item name', () => {
      render(<LibraryManager {...buildProps()} />);
      for (const item of defaultItems) {
        expect(screen.getByText(item.name)).toBeInTheDocument();
      }
    });

    it('shows "Has image" text for items with imageUrl', () => {
      render(<LibraryManager {...buildProps()} />);
      // bin-1x1 has imageUrl, bin-2x2 does not
      const metaDivs = screen.getAllByText(/has image/i);
      expect(metaDivs.length).toBeGreaterThanOrEqual(1);
    });

    it('renders action buttons in the list view', () => {
      render(<LibraryManager {...buildProps()} />);
      expect(screen.getByRole('button', { name: /add new item/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /manage categories/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset to defaults/i })).toBeInTheDocument();
    });

    it('renders an Edit and Delete button for each item', () => {
      render(<LibraryManager {...buildProps()} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i });
      expect(editBtns).toHaveLength(defaultItems.length);
      expect(deleteBtns).toHaveLength(defaultItems.length);
    });

    it('does not render the form initially', () => {
      render(<LibraryManager {...buildProps()} />);
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
    });

    it('does not render an error message initially', () => {
      render(<LibraryManager {...buildProps()} />);
      expect(screen.queryByText(/an error occurred/i)).not.toBeInTheDocument();
    });

    it('renders with empty items list', () => {
      render(<LibraryManager {...buildProps({ items: [] })} />);
      expect(screen.getByText('Library Items (0)')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // Closing the dialog
  // -------------------------------------------------------------------
  describe('Closing the dialog', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<LibraryManager {...buildProps({ onClose })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the overlay backdrop is clicked', () => {
      const onClose = vi.fn();
      render(<LibraryManager {...buildProps({ onClose })} />);
      const overlay = document.querySelector('.library-manager-overlay') as HTMLElement;
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onClose when the dialog itself is clicked', () => {
      const onClose = vi.fn();
      render(<LibraryManager {...buildProps({ onClose })} />);
      const dialog = screen.getByRole('dialog', { name: 'Manage Library' });
      fireEvent.click(dialog);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      render(<LibraryManager {...buildProps({ onClose })} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------
  // Add item form
  // -------------------------------------------------------------------
  describe('Add item form', () => {
    it('shows the add form when "Add New Item" button is clicked', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));
      expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
    });

    it('renders all required form fields in add mode', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));
      expect(screen.getByLabelText(/^id \*/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^name \*/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/width \(units\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/height \(units\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/color \*/i)).toBeInTheDocument();
    });

    it('renders category checkboxes in add mode', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));
      for (const cat of defaultCategories) {
        expect(screen.getByText(cat.name)).toBeInTheDocument();
      }
    });

    it('ID field is enabled in add mode', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));
      expect(screen.getByLabelText(/^id \*/i)).not.toBeDisabled();
    });

    it('submit button says "Add Item" in add mode', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));
      expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
    });

    it('canceling the add form returns to list view', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));
      expect(screen.getByRole('heading', { name: /add new item/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.getByText(`Library Items (${defaultItems.length})`)).toBeInTheDocument();
    });

    it('calls onAddItem with form data on submit', () => {
      const onAddItem = vi.fn();
      render(<LibraryManager {...buildProps({ onAddItem })} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));

      fireEvent.change(screen.getByLabelText(/^id \*/i), { target: { value: 'new-bin' } });
      fireEvent.change(screen.getByLabelText(/^name \*/i), { target: { value: 'New Bin' } });

      fireEvent.click(screen.getByRole('button', { name: /add item/i }));
      expect(onAddItem).toHaveBeenCalledTimes(1);
      expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-bin', name: 'New Bin' }));
    });

    it('returns to list view after successful add', () => {
      const onAddItem = vi.fn();
      render(<LibraryManager {...buildProps({ onAddItem })} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));
      fireEvent.change(screen.getByLabelText(/^id \*/i), { target: { value: 'another-bin' } });
      fireEvent.change(screen.getByLabelText(/^name \*/i), { target: { value: 'Another Bin' } });
      fireEvent.click(screen.getByRole('button', { name: /add item/i }));
      expect(screen.getByText(`Library Items (${defaultItems.length})`)).toBeInTheDocument();
    });

    it('shows error message when onAddItem throws', () => {
      const onAddItem = vi.fn().mockImplementation(() => {
        throw new Error('Duplicate ID');
      });
      render(<LibraryManager {...buildProps({ onAddItem })} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));
      fireEvent.change(screen.getByLabelText(/^id \*/i), { target: { value: 'dup' } });
      fireEvent.change(screen.getByLabelText(/^name \*/i), { target: { value: 'Dup' } });
      fireEvent.click(screen.getByRole('button', { name: /add item/i }));
      expect(screen.getByText('Duplicate ID')).toBeInTheDocument();
    });

    it('shows validation warning when no categories are selected', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));

      // Uncheck all categories
      for (const cat of defaultCategories) {
        const checkbox = screen.getByRole('checkbox', { name: new RegExp(cat.name, 'i') });
        if ((checkbox as HTMLInputElement).checked) {
          fireEvent.click(checkbox);
        }
      }

      expect(screen.getByText(/at least one category must be selected/i)).toBeInTheDocument();
    });

    it('toggling category checkbox updates the form state', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /add new item/i }));

      const utensilCheckbox = screen.getByRole('checkbox', { name: /utensil/i });
      fireEvent.click(utensilCheckbox);
      expect((utensilCheckbox as HTMLInputElement).checked).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Edit item form
  // -------------------------------------------------------------------
  describe('Edit item form', () => {
    it('shows the edit form when Edit button is clicked', () => {
      render(<LibraryManager {...buildProps()} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtns[0]);
      expect(screen.getByRole('heading', { name: /edit item/i })).toBeInTheDocument();
    });

    it('pre-populates form fields with the item data', () => {
      render(<LibraryManager {...buildProps()} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtns[0]);

      const idInput = screen.getByLabelText(/^id \*/i) as HTMLInputElement;
      const nameInput = screen.getByLabelText(/^name \*/i) as HTMLInputElement;
      expect(idInput.value).toBe(defaultItems[0].id);
      expect(nameInput.value).toBe(defaultItems[0].name);
    });

    it('ID field is disabled in edit mode', () => {
      render(<LibraryManager {...buildProps()} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtns[0]);
      expect(screen.getByLabelText(/^id \*/i)).toBeDisabled();
    });

    it('submit button says "Save Changes" in edit mode', () => {
      render(<LibraryManager {...buildProps()} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtns[0]);
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });

    it('calls onUpdateItem with the item id and updated data on submit', () => {
      const onUpdateItem = vi.fn();
      render(<LibraryManager {...buildProps({ onUpdateItem })} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtns[0]);

      const nameInput = screen.getByLabelText(/^name \*/i);
      fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      expect(onUpdateItem).toHaveBeenCalledTimes(1);
      expect(onUpdateItem).toHaveBeenCalledWith(
        defaultItems[0].id,
        expect.objectContaining({ name: 'Updated Name' })
      );
    });

    it('returns to list view after successful edit', () => {
      const onUpdateItem = vi.fn();
      render(<LibraryManager {...buildProps({ onUpdateItem })} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      expect(screen.getByText(`Library Items (${defaultItems.length})`)).toBeInTheDocument();
    });

    it('canceling edit form returns to list view', () => {
      render(<LibraryManager {...buildProps()} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.getByText(`Library Items (${defaultItems.length})`)).toBeInTheDocument();
    });

    it('shows error message when onUpdateItem throws', () => {
      const onUpdateItem = vi.fn().mockImplementation(() => {
        throw new Error('Update failed');
      });
      render(<LibraryManager {...buildProps({ onUpdateItem })} />);
      const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
      fireEvent.click(editBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // Delete item
  // -------------------------------------------------------------------
  describe('Delete item', () => {
    it('opens a confirmation dialog when Delete is clicked', async () => {
      render(<LibraryManager {...buildProps()} />);
      const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i });
      fireEvent.click(deleteBtns[0]);
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /delete item/i })).toBeInTheDocument();
      });
    });

    it('calls onDeleteItem when deletion is confirmed', async () => {
      const onDeleteItem = vi.fn();
      render(<LibraryManager {...buildProps({ onDeleteItem })} />);
      const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i });
      fireEvent.click(deleteBtns[0]);

      // Wait for the confirm dialog to appear then click its confirm button
      const confirmBtn = await waitFor(() => {
        const btn = document.querySelector('.confirm-dialog-confirm') as HTMLElement;
        if (!btn) throw new Error('Confirm button not found');
        return btn;
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onDeleteItem).toHaveBeenCalledWith(defaultItems[0].id);
      });
    });

    it('does NOT call onDeleteItem when deletion is cancelled', async () => {
      const onDeleteItem = vi.fn();
      render(<LibraryManager {...buildProps({ onDeleteItem })} />);
      const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i });
      fireEvent.click(deleteBtns[0]);

      const cancelBtn = await waitFor(() => screen.getByRole('button', { name: /cancel/i }));
      fireEvent.click(cancelBtn);

      expect(onDeleteItem).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Reset to defaults
  // -------------------------------------------------------------------
  describe('Reset to defaults', () => {
    it('opens a confirmation dialog when Reset to Defaults is clicked', async () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /reset library/i })).toBeInTheDocument();
      });
    });

    it('calls onResetToDefaults when reset is confirmed', async () => {
      const onResetToDefaults = vi.fn();
      render(<LibraryManager {...buildProps({ onResetToDefaults })} />);
      fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));

      const resetBtn = await waitFor(() => screen.getByRole('button', { name: /^reset$/i }));
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(onResetToDefaults).toHaveBeenCalledTimes(1);
      });
    });

    it('does NOT call onResetToDefaults when reset is cancelled', async () => {
      const onResetToDefaults = vi.fn();
      render(<LibraryManager {...buildProps({ onResetToDefaults })} />);
      fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));

      const cancelBtn = await waitFor(() => screen.getByRole('button', { name: /cancel/i }));
      fireEvent.click(cancelBtn);

      expect(onResetToDefaults).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Category Manager
  // -------------------------------------------------------------------
  describe('Category Manager', () => {
    it('shows the CategoryManager when "Manage Categories" is clicked', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /manage categories/i }));
      expect(screen.getByRole('heading', { name: /manage categories/i })).toBeInTheDocument();
    });

    it('hides the item list when CategoryManager is shown', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /manage categories/i }));
      expect(screen.queryByText(`Library Items (${defaultItems.length})`)).not.toBeInTheDocument();
    });

    it('returns to list view when CategoryManager is closed', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /manage categories/i }));
      // CategoryManager renders its own close button; click the one inside the
      // Manage Categories panel (the heading distinguishes it from LibraryManager's own close)
      expect(screen.getByRole('heading', { name: /manage categories/i })).toBeInTheDocument();
      const closeButtons = screen.getAllByRole('button', { name: /^close$/i });
      fireEvent.click(closeButtons[closeButtons.length - 1]);
      expect(screen.getByText(`Library Items (${defaultItems.length})`)).toBeInTheDocument();
    });

    it('renders category list inside CategoryManager', () => {
      render(<LibraryManager {...buildProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /manage categories/i }));
      expect(screen.getByText(`Categories (${defaultCategories.length})`)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // Item details displayed in list
  // -------------------------------------------------------------------
  describe('Item details in list', () => {
    it('displays item dimensions', () => {
      render(<LibraryManager {...buildProps()} />);
      // bin-1x1 => "1×1 units"
      expect(screen.getByText(/1×1 units/)).toBeInTheDocument();
    });

    it('displays item ID', () => {
      render(<LibraryManager {...buildProps()} />);
      expect(screen.getByText(`ID: ${defaultItems[0].id}`)).toBeInTheDocument();
    });

    it('displays item categories', () => {
      render(<LibraryManager {...buildProps()} />);
      // The meta row contains "bin" for category
      const metas = document.querySelectorAll('.item-meta');
      expect(metas.length).toBeGreaterThanOrEqual(1);
      expect(metas[0].textContent).toContain('bin');
    });

    it('renders color box with item color as background', () => {
      render(<LibraryManager {...buildProps()} />);
      const colorBoxes = document.querySelectorAll('.item-color-box');
      expect(colorBoxes.length).toBe(defaultItems.length);
      expect((colorBoxes[0] as HTMLElement).style.backgroundColor).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------
  describe('Accessibility', () => {
    it('dialog has aria-modal="true"', () => {
      render(<LibraryManager {...buildProps()} />);
      const dialog = screen.getByRole('dialog', { name: 'Manage Library' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('dialog has a tabIndex so it can receive focus', () => {
      render(<LibraryManager {...buildProps()} />);
      const dialog = screen.getByRole('dialog', { name: 'Manage Library' });
      expect(dialog).toHaveAttribute('tabindex', '-1');
    });
  });
});
