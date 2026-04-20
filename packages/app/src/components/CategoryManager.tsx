import { useState } from 'react';
import type { Category, LibraryItem } from '../types/gridfinity';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { ConfirmDialog } from './ConfirmDialog';

interface CategoryManagerProps {
  categories: Category[];
  onClose: () => void;
  onAddCategory: (category: Category) => void;
  onUpdateCategory: (id: string, updates: Partial<Category>) => void;
  onDeleteCategory: (id: string) => void;
  onResetToDefaults: () => void;
  getItemsUsingCategory: (categoryId: string) => LibraryItem[];
}

type FormMode = 'add' | 'edit' | null;

export function CategoryManager({
  categories,
  onClose,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onResetToDefaults,
  getItemsUsingCategory,
}: CategoryManagerProps) {
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Category>>({
    id: '',
    name: '',
    color: '#646cff',
    order: undefined,
  });
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialogProps: confirmDialogProps } = useConfirmDialog();

  const handleStartAdd = () => {
    setFormMode('add');
    setEditingId(null);
    setFormData({
      id: '',
      name: '',
      color: '#646cff',
      order: categories.length + 1,
    });
    setError(null);
  };

  const handleStartEdit = (category: Category) => {
    setFormMode('edit');
    setEditingId(category.id);
    setFormData(category);
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
        if (!formData.id || !formData.name) {
          setError('ID and name are required');
          return;
        }
        onAddCategory(formData as Category);
        setFormMode(null);
      } else if (formMode === 'edit' && editingId) {
        onUpdateCategory(editingId, formData);
        setFormMode(null);
        setEditingId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleDelete = async (id: string) => {
    const itemsUsing = getItemsUsingCategory(id);

    // Check if any items would have no categories left after deletion
    const itemsWithOnlyThisCategory = itemsUsing.filter(item => item.categories.length === 1);

    if (itemsWithOnlyThisCategory.length > 0) {
      setError(
        `Cannot delete category. ${itemsWithOnlyThisCategory.length} items would have no categories: ${itemsWithOnlyThisCategory
          .slice(0, 5)
          .map(i => i.name)
          .join(', ')}${itemsWithOnlyThisCategory.length > 5 ? ', ...' : ''}`
      );
      return;
    }

    const categoryName = categories.find(c => c.id === id)?.name;
    const warningMessage = itemsUsing.length > 0
      ? `Are you sure you want to delete the category "${categoryName}"?\n\nThis category will be removed from ${itemsUsing.length} item(s), but they will remain in other categories.`
      : `Are you sure you want to delete the category "${categoryName}"?`;

    if (await confirm({ title: 'Delete Category', message: warningMessage, variant: 'danger', confirmLabel: 'Delete', cancelLabel: 'Cancel' })) {
      try {
        onDeleteCategory(id);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }
  };

  const handleReset = async () => {
    if (await confirm({ title: 'Reset Categories', message: 'Are you sure you want to reset to default categories? All custom categories will be lost.', variant: 'danger', confirmLabel: 'Reset', cancelLabel: 'Cancel' })) {
      onResetToDefaults();
      setFormMode(null);
      setEditingId(null);
      setError(null);
    }
  };

  // Sort categories by order
  const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="library-manager-overlay" onClick={onClose}>
      <div className="library-manager" onClick={(e) => e.stopPropagation()}>
        <div className="library-manager-header">
          <h2>Manage Categories</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && (
          <div className="library-manager-error">
            {error}
          </div>
        )}

        {formMode === null ? (
          <>
            <div className="library-manager-actions">
              <button className="add-item-button" onClick={handleStartAdd}>
                + Add New Category
              </button>
              <button className="reset-button" onClick={handleReset}>
                Reset to Defaults
              </button>
            </div>

            <div className="library-manager-list">
              <h3>Categories ({categories.length})</h3>
              {sortedCategories.map(category => (
                <div key={category.id} className="library-manager-item">
                  <div className="item-info">
                    <div
                      className="item-color-box"
                      style={{ backgroundColor: category.color || '#646cff' }}
                      aria-label={`Color: ${category.color}`}
                    />
                    <div className="item-details">
                      <div className="item-name">{category.name}</div>
                      <div className="item-id">ID: {category.id}</div>
                    </div>
                  </div>
                  <div className="item-actions">
                    <button
                      className="edit-button"
                      onClick={() => handleStartEdit(category)}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDelete(category.id)}
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
            <h3>{formMode === 'add' ? 'Add New Category' : 'Edit Category'}</h3>

            <div className="form-group">
              <label htmlFor="category-id">ID *</label>
              <input
                id="category-id"
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                required
                disabled={formMode === 'edit'}
                placeholder="e.g., tools"
              />
              <small>Lowercase, no spaces (used internally)</small>
            </div>

            <div className="form-group">
              <label htmlFor="category-name">Name *</label>
              <input
                id="category-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Tool Holders"
              />
              <small>Display name shown in the library</small>
            </div>

            <div className="form-group">
              <label htmlFor="category-color">Color</label>
              <div className="color-input-group">
                <input
                  id="category-color"
                  type="color"
                  value={formData.color || '#646cff'}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
                <input
                  type="text"
                  value={formData.color || '#646cff'}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#646cff"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
              <small>Color accent for category sections</small>
            </div>

            <div className="form-group">
              <label htmlFor="category-order">Sort Order</label>
              <input
                id="category-order"
                type="number"
                min="1"
                value={formData.order || ''}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || undefined })}
                placeholder="Optional"
              />
              <small>Lower numbers appear first</small>
            </div>

            <div className="form-actions">
              <button type="button" className="cancel-button" onClick={handleCancelForm}>
                Cancel
              </button>
              <button type="submit" className="submit-button">
                {formMode === 'add' ? 'Add Category' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
        <ConfirmDialog {...confirmDialogProps} />
      </div>
    </div>
  );
}
