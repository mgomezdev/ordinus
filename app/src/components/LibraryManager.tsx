import { useState, useEffect, useRef } from 'react';
import type { LibraryItem, Category } from '../types/gridfinity';
import { CategoryManager } from './CategoryManager';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { ConfirmDialog } from './ConfirmDialog';

interface LibraryManagerProps {
  items: LibraryItem[];
  categories: Category[];
  onClose: () => void;
  onAddItem: (item: LibraryItem) => void;
  onUpdateItem: (id: string, updates: Partial<LibraryItem>) => void;
  onDeleteItem: (id: string) => void;
  onResetToDefaults: () => void;
  onAddCategory: (category: Category) => void;
  onUpdateCategory: (id: string, updates: Partial<Category>) => void;
  onDeleteCategory: (id: string) => void;
  onResetCategories: () => void;
  onUpdateItemCategories: (oldCategoryId: string, newCategoryId: string) => void;
  getCategoryById: (id: string) => Category | undefined;
}

type FormMode = 'add' | 'edit' | null;

export function LibraryManager({
  items,
  categories,
  onClose,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onResetToDefaults,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onResetCategories,
  onUpdateItemCategories,
  getCategoryById,
}: LibraryManagerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const { confirm, dialogProps: confirmDialogProps } = useConfirmDialog();

  // Focus trap and restore
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    dialogRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const [formData, setFormData] = useState<Partial<LibraryItem>>({
    id: '',
    name: '',
    widthUnits: 1,
    heightUnits: 1,
    color: '#646cff',
    categories: categories[0]?.id ? [categories[0].id] : ['bin'],
    imageUrl: '',
  });
  const [error, setError] = useState<string | null>(null);

  const handleStartAdd = () => {
    setFormMode('add');
    setEditingId(null);
    setFormData({
      id: '',
      name: '',
      widthUnits: 1,
      heightUnits: 1,
      color: '#646cff',
      categories: categories[0]?.id ? [categories[0].id] : ['bin'],
      imageUrl: '',
    });
    setError(null);
  };

  const handleCategoryUpdate = (id: string, updates: Partial<Category>) => {
    const oldCategory = getCategoryById(id);

    // If name changed, cascade to all items
    if (oldCategory && updates.id && updates.id !== oldCategory.id) {
      onUpdateItemCategories(oldCategory.id, updates.id);
    }

    onUpdateCategory(id, updates);
  };

  const getItemsUsingCategory = (categoryId: string): LibraryItem[] => {
    return items.filter(item => item.categories.includes(categoryId));
  };

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      categories: checked
        ? [...(prev.categories || []), categoryId]
        : (prev.categories || []).filter(id => id !== categoryId)
    }));
  };

  const handleStartEdit = (item: LibraryItem) => {
    setFormMode('edit');
    setEditingId(item.id);
    setFormData(item);
    setError(null);
  };

  const handleCancelForm = () => {
    setFormMode(null);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (formMode === 'add') {
        onAddItem(formData as LibraryItem);
        setFormMode(null);
      } else if (formMode === 'edit' && editingId) {
        onUpdateItem(editingId, formData);
        setFormMode(null);
        setEditingId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleDelete = async (id: string) => {
    if (await confirm({ title: 'Delete Item', message: 'Are you sure you want to delete this item?', variant: 'danger', confirmLabel: 'Delete', cancelLabel: 'Cancel' })) {
      try {
        onDeleteItem(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }
  };

  const handleReset = async () => {
    if (await confirm({ title: 'Reset Library', message: 'Are you sure you want to reset to default library? All custom items will be lost.', variant: 'danger', confirmLabel: 'Reset', cancelLabel: 'Cancel' })) {
      onResetToDefaults();
      setFormMode(null);
      setEditingId(null);
      setError(null);
    }
  };

  return (
    <div className="library-manager-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="library-manager"
        role="dialog"
        aria-label="Manage Library"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="library-manager-header">
          <h2>Manage Library</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && (
          <div className="library-manager-error">
            {error}
          </div>
        )}

        {formMode === null && !showCategoryManager ? (
          <>
            <div className="library-manager-actions">
              <button className="add-item-button" onClick={handleStartAdd}>
                + Add New Item
              </button>
              <button className="manage-categories-button" onClick={() => setShowCategoryManager(true)}>
                Manage Categories
              </button>
              <button className="reset-button" onClick={handleReset}>
                Reset to Defaults
              </button>
            </div>

            <div className="library-manager-list">
              <h3>Library Items ({items.length})</h3>
              {items.map(item => (
                <div key={item.id} className="library-manager-item">
                  <div className="item-info">
                    <div
                      className="item-color-box"
                      style={{ backgroundColor: item.color }}
                      aria-label={`Color: ${item.color}`}
                    />
                    <div className="item-details">
                      <div className="item-name">{item.name}</div>
                      <div className="item-meta">
                        {item.widthUnits}×{item.heightUnits} units • {item.categories.join(', ')}
                        {item.imageUrl && ' • Has image'}
                      </div>
                      <div className="item-id">ID: {item.id}</div>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button
                      className="edit-button"
                      onClick={() => handleStartEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <form className="library-manager-form" onSubmit={handleSubmit}>
            <h3>{formMode === 'add' ? 'Add New Item' : 'Edit Item'}</h3>

            <div className="form-group">
              <label htmlFor="item-id">ID *</label>
              <input
                id="item-id"
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                required
                disabled={formMode === 'edit'}
                placeholder="e.g., bin-3x2"
              />
            </div>

            <div className="form-group">
              <label htmlFor="item-name">Name *</label>
              <input
                id="item-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., 3x2 Bin"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="item-width">Width (units) *</label>
                <input
                  id="item-width"
                  type="number"
                  min="1"
                  value={formData.widthUnits}
                  onChange={(e) => setFormData({ ...formData, widthUnits: parseInt(e.target.value) })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="item-height">Height (units) *</label>
                <input
                  id="item-height"
                  type="number"
                  min="1"
                  value={formData.heightUnits}
                  onChange={(e) => setFormData({ ...formData, heightUnits: parseInt(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Categories * (Select at least one)</label>
              <div className="category-checkbox-list">
                {categories.map(cat => (
                  <label key={cat.id} className="category-checkbox-item">
                    <input
                      type="checkbox"
                      checked={formData.categories?.includes(cat.id) || false}
                      onChange={(e) => handleCategoryToggle(cat.id, e.target.checked)}
                    />
                    <span
                      className="category-color-indicator"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                  </label>
                ))}
              </div>
              {formData.categories?.length === 0 && (
                <div className="form-validation-error">
                  At least one category must be selected
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="item-color">Color *</label>
              <div className="color-input-group">
                <input
                  id="item-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  required
                />
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#646cff"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="item-image-url">Image URL (Optional)</label>
              <input
                id="item-image-url"
                type="text"
                value={formData.imageUrl || ''}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="e.g., /icons/bin.png or https://example.com/icon.png"
              />
              <small>
                Provide a URL to display an image icon instead of the colored grid preview.
                Supports PNG, JPG, SVG, and WebP formats. Leave empty to use the grid preview.
              </small>
            </div>

            <div className="form-actions">
              <button type="button" className="cancel-button" onClick={handleCancelForm}>
                Cancel
              </button>
              <button type="submit" className="submit-button">
                {formMode === 'add' ? 'Add Item' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}

        {showCategoryManager && (
          <CategoryManager
            categories={categories}
            onClose={() => setShowCategoryManager(false)}
            onAddCategory={onAddCategory}
            onUpdateCategory={handleCategoryUpdate}
            onDeleteCategory={onDeleteCategory}
            onResetToDefaults={onResetCategories}
            getItemsUsingCategory={getItemsUsingCategory}
          />
        )}
        <ConfirmDialog {...confirmDialogProps} />
      </div>
    </div>
  );
}
