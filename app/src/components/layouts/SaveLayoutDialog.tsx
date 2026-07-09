import { useState, useCallback } from 'react';
import type { PlacedItemWithValidity, GridSpacerConfig } from '../../types/gridfinity';
import type { RefImagePlacement } from '../../hooks/useRefImagePlacements';
import { buildPayload } from '../../utils/layoutHelpers';
import { useSaveLayoutMutation } from '../../hooks/useLayouts';
import { useCustomers } from '../../contexts/CustomerContext';

interface SaveLayoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  gridX: number;
  gridY: number;
  widthMm: number;
  depthMm: number;
  spacerConfig: GridSpacerConfig;
  placedItems: PlacedItemWithValidity[];
  refImagePlacements?: RefImagePlacement[];
  currentLayoutId?: number | null;
  currentLayoutName?: string;
  currentLayoutDescription?: string;
  onSaveComplete?: (layoutId: number, name: string) => void;
}

interface SaveLayoutFormProps {
  onClose: () => void;
  gridX: number;
  gridY: number;
  widthMm: number;
  depthMm: number;
  spacerConfig: GridSpacerConfig;
  placedItems: PlacedItemWithValidity[];
  refImagePlacements?: RefImagePlacement[];
  currentLayoutName?: string;
  currentLayoutDescription?: string;
  onSaveComplete?: (layoutId: number, name: string) => void;
}

function SaveLayoutForm({
  onClose,
  gridX,
  gridY,
  widthMm,
  depthMm,
  spacerConfig,
  placedItems,
  refImagePlacements = [],
  currentLayoutName = '',
  currentLayoutDescription = '',
  onSaveComplete,
}: SaveLayoutFormProps) {
  const [name, setName] = useState(currentLayoutName);
  const [description, setDescription] = useState(currentLayoutDescription);
  const [successMessage, setSuccessMessage] = useState('');

  const { customers, selectedCustomer } = useCustomers();
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    selectedCustomer?.id ?? null,
  );

  const saveLayoutMutation = useSaveLayoutMutation();

  const isPending = saveLayoutMutation.isPending;
  const error = saveLayoutMutation.error;
  const isError = saveLayoutMutation.isError;

  const handleSaveNew = async () => {
    if (!name.trim()) return;

    try {
      const payload = buildPayload(
        name, description, gridX, gridY, widthMm, depthMm,
        spacerConfig, placedItems, refImagePlacements, selectedCustomerId,
      );
      const result = await saveLayoutMutation.mutateAsync(payload);

      onSaveComplete?.(result.id, result.name);
      setSuccessMessage('Layout saved successfully!');
      setTimeout(() => onClose(), 1000);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && name.trim() && !isPending) {
      void handleSaveNew();
    }
  };

  const nameInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      setTimeout(() => node.focus(), 50);
    }
  }, []);

  const validImageCount = refImagePlacements.filter(p => p.refImageId !== null).length;

  return (
    <div className="layout-dialog-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        className="layout-dialog"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Save Layout"
      >
        <div className="layout-dialog-header">
          <h2>Save Layout</h2>
          <button
            className="layout-dialog-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="layout-dialog-body">
          {successMessage ? (
            <div className="layout-success-message">{successMessage}</div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="layout-name">Name</label>
                <input
                  ref={nameInputRef}
                  id="layout-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="My Layout"
                  maxLength={100}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="layout-description">Description (optional)</label>
                <textarea
                  id="layout-description"
                  className="layout-description-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="A brief description of this layout..."
                  maxLength={500}
                  rows={3}
                />
              </div>

              {customers.length > 0 && (
                <div className="form-group">
                  <label htmlFor="layout-customer">Customer (optional)</label>
                  <select
                    id="layout-customer"
                    value={selectedCustomerId ?? ''}
                    onChange={e => setSelectedCustomerId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— None —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="layout-dialog-info">
                <span>Grid: {gridX} x {gridY}</span>
                <span>Items: {placedItems.length}</span>
                {validImageCount > 0 && <span>Images: {validImageCount}</span>}
              </div>

              {isError && (
                <div className="layout-error-message">
                  {error?.message ?? 'Failed to save layout'}
                </div>
              )}

              <div className="layout-dialog-actions">
                <button
                  className="cancel-button"
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="submit-button"
                  onClick={() => void handleSaveNew()}
                  type="button"
                  disabled={!name.trim() || isPending}
                >
                  {saveLayoutMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function SaveLayoutDialog({
  isOpen,
  onClose,
  gridX,
  gridY,
  widthMm,
  depthMm,
  spacerConfig,
  placedItems,
  refImagePlacements,
  currentLayoutName,
  currentLayoutDescription,
  onSaveComplete,
}: SaveLayoutDialogProps) {
  if (!isOpen) return null;

  return (
    <SaveLayoutForm
      onClose={onClose}
      gridX={gridX}
      gridY={gridY}
      widthMm={widthMm}
      depthMm={depthMm}
      spacerConfig={spacerConfig}
      placedItems={placedItems}
      refImagePlacements={refImagePlacements}
      currentLayoutName={currentLayoutName}
      currentLayoutDescription={currentLayoutDescription}
      onSaveComplete={onSaveComplete}
    />
  );
}
