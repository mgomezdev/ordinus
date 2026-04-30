import { useState } from 'react';
import type { ApiUserStl } from '@gridfinity/shared';
import {
  useUpdateUserStlMutation,
  useDeleteUserStlMutation,
  useReprocessUserStlMutation,
  useReplaceUserStlFileMutation,
} from '../hooks/useUserStls';
import { useAuth } from '../contexts/AuthContext';

interface UserStlEditModalProps {
  item: ApiUserStl;
  onClose: () => void;
}

export function UserStlEditModal({ item, onClose }: UserStlEditModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [name, setName] = useState(item.name);
  const [gridX, setGridX] = useState<string>(item.gridX != null ? String(item.gridX) : '');
  const [gridY, setGridY] = useState<string>(item.gridY != null ? String(item.gridY) : '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { mutateAsync: update, isPending: isSaving } = useUpdateUserStlMutation();
  const { mutateAsync: remove, isPending: isDeleting } = useDeleteUserStlMutation();
  const { mutateAsync: reprocess, isPending: isReprocessing } = useReprocessUserStlMutation();
  const { mutateAsync: replaceFile, isPending: isReplacing } = useReplaceUserStlFileMutation();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await update({
        id: item.id,
        name: name.trim() || undefined,
        gridX: gridX ? Number(gridX) : null,
        gridY: gridY ? Number(gridY) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const handleDelete = async () => {
    try {
      await remove(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleReprocess = async () => {
    setError(null);
    try {
      await reprocess(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reprocess failed.');
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    try {
      await replaceFile({ id: item.id, file: f });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replace failed.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Edit Model</h2>
        <form onSubmit={(e) => void handleSave(e)}>
          <div className="form-field">
            <label htmlFor="edit-name">Name</label>
            <input id="edit-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="edit-gridx">Grid X</label>
            <input id="edit-gridx" type="number" min="1" value={gridX} onChange={(e) => setGridX(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="edit-gridy">Grid Y</label>
            <input id="edit-gridy" type="number" min="1" value={gridY} onChange={(e) => setGridY(e.target.value)} />
          </div>
          {error && <div role="alert" className="edit-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={isSaving}>{isSaving ? 'Saving\u2026' : 'Save'}</button>
          </div>
        </form>

        <div className="modal-secondary-actions">
          <label className="replace-file-label">
            {isReplacing ? 'Replacing\u2026' : 'Replace file'}
            <input
              type="file"
              accept=".stl,.3mf"
              onChange={(e) => void handleReplaceFile(e)}
              style={{ display: 'none' }}
            />
          </label>

          {isAdmin && (
            <button type="button" onClick={() => void handleReprocess()} disabled={isReprocessing}>
              {isReprocessing ? 'Reprocessing\u2026' : 'Reprocess'}
            </button>
          )}

          {!confirmDelete ? (
            <button type="button" className="delete-btn" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ) : (
            <span className="confirm-delete">
              Are you sure?{' '}
              <button type="button" onClick={() => void handleDelete()} disabled={isDeleting}>
                Yes, delete
              </button>{' '}
              <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
