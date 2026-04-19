import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  useLayoutsQuery,
  useDeleteLayoutMutation,
  useCloneLayoutMutation,
} from '../hooks/useLayouts';
import { SavedConfigCard } from '../components/layouts/SavedConfigCard';
import './SavedConfigsPage.css';

export function SavedConfigsPage() {
  const navigate = useNavigate();
  const { loadLayout } = useWorkspace();
  const layoutsQuery = useLayoutsQuery();
  const deleteMutation = useDeleteLayoutMutation();
  const cloneMutation = useCloneLayoutMutation();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const handleEdit = async (id: number) => {
    try {
      await loadLayout(id);
      navigate('/');
    } catch (err) {
      console.error('Failed to load layout:', err);
    }
  };

  const newConfigCard = (
    <button
      className="saved-config-card new-config"
      onClick={() => navigate('/')}
      type="button"
    >
      <span className="saved-config-new-icon">+</span>
      <span className="saved-config-new-label">New Configuration</span>
      <span className="saved-config-new-hint">Start a fresh layout</span>
    </button>
  );

  return (
    <div className="saved-configs-page">
      {pageError && (
        <div className="saved-configs-error" role="alert">
          {pageError}
          <button
            type="button"
            className="saved-configs-error-dismiss"
            onClick={() => setPageError(null)}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}
      <div className="saved-configs-header">
        <h2 className="saved-configs-title">My Saved Configs</h2>
        <p className="saved-configs-subtitle">Review and manage your gridfinity layouts.</p>
      </div>

      {layoutsQuery.isLoading && (
        <div className="saved-configs-loading">Loading layouts...</div>
      )}

      {layoutsQuery.isError && (
        <div className="saved-configs-empty">
          {(layoutsQuery.error as Error)?.message ?? 'Failed to load layouts'}
        </div>
      )}

      {!layoutsQuery.isLoading && !layoutsQuery.isError && layoutsQuery.data && layoutsQuery.data.length > 0 && (
        <div className="saved-configs-grid">
          {layoutsQuery.data.map(layout => (
            <SavedConfigCard
              key={layout.id}
              layout={layout}
              onEdit={handleEdit}
              onDelete={async (id) => {
                setDeletingId(id);
                try {
                  await deleteMutation.mutateAsync(id);
                } finally {
                  setDeletingId(null);
                }
              }}
              onDuplicate={(id) => cloneMutation.mutate(id, {
                onError: () => setPageError('Failed to duplicate. Please try again.'),
                onSuccess: () => setPageError(null),
              })}
              isDeleting={deletingId === layout.id}
            />
          ))}

          {newConfigCard}
        </div>
      )}

      {!layoutsQuery.isLoading && !layoutsQuery.isError && layoutsQuery.data?.length === 0 && (
        <div className="saved-configs-empty">
          <p>No saved layouts yet.</p>
          <button
            className="saved-config-btn saved-config-submit"
            onClick={() => navigate('/')}
            type="button"
          >
            Start your first layout
          </button>
        </div>
      )}
    </div>
  );
}
