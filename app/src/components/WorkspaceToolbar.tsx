import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useUpdateLayoutMutation } from '../hooks/useLayouts';
import { buildPayload } from '../utils/layoutHelpers';

interface WorkspaceToolbarProps {
  onExportPdf: () => Promise<void>;
  exportPdfError: string | null;
}

export function WorkspaceToolbar({ onExportPdf, exportPdfError }: WorkspaceToolbarProps) {
  const navigate = useNavigate();
  const {
    layoutMeta,
    placedItems, refImagePlacements, gridResult, drawerWidth, drawerDepth,
    spacerConfig, handleSaveComplete,
    handleClearAll, dialogDispatch,
  } = useWorkspace();

  const updateLayoutMutation = useUpdateLayoutMutation();
  const [toast, setToast] = useState<{ visible: boolean; isError: boolean }>({
    visible: false,
    isError: false,
  });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const handleDirectSave = useCallback(async () => {
    if (!layoutMeta.id) return;
    try {
      const payload = buildPayload(
        layoutMeta.name, layoutMeta.description,
        gridResult.gridX, gridResult.gridY,
        drawerWidth, drawerDepth, spacerConfig, placedItems, refImagePlacements,
      );
      const result = await updateLayoutMutation.mutateAsync({ id: layoutMeta.id, data: payload });
      handleSaveComplete(result.id, result.name);
      setToast({ visible: true, isError: false });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(
        () => setToast(t => ({ ...t, visible: false })), 1500,
      );
    } catch {
      setToast({ visible: true, isError: true });
    }
  }, [layoutMeta, gridResult, drawerWidth, drawerDepth, spacerConfig, placedItems,
    refImagePlacements, updateLayoutMutation, handleSaveComplete]);

  return (
    <div className="reference-image-toolbar">
      <button className="layout-toolbar-btn layout-load-btn" onClick={() => navigate('/configs')} type="button">Load</button>

      {/* Unsaved layout */}
      {!layoutMeta.id && (
        <button
          className="layout-toolbar-btn layout-save-btn"
          onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'save' })}
          type="button"
          disabled={placedItems.length === 0 && refImagePlacements.length === 0}
        >
          Save
        </button>
      )}

      {/* Saved layout */}
      {!!layoutMeta.id && (
        <>
          <button
            className="layout-toolbar-btn"
            onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'save' })}
            type="button"
          >
            Save as New
          </button>
          <button
            className="layout-toolbar-btn layout-save-btn"
            onClick={() => void handleDirectSave()}
            type="button"
            disabled={updateLayoutMutation.isPending || (placedItems.length === 0 && refImagePlacements.length === 0)}
          >
            {updateLayoutMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      )}

      {toast.visible && (
        <div className={`save-toast ${toast.isError ? 'save-toast-error' : 'save-toast-success'}`}>
          {toast.isError ? (
            <>
              <span>Save failed. Try again.</span>
              <button
                type="button"
                className="save-toast-dismiss"
                onClick={() => setToast(t => ({ ...t, visible: false }))}
                aria-label="Dismiss"
              >
                &times;
              </button>
            </>
          ) : (
            <span>Saved!</span>
          )}
        </div>
      )}

      <button
        className="layout-toolbar-btn layout-export-btn"
        onClick={onExportPdf}
        type="button"
        disabled={placedItems.length === 0}
        title="Export layout as PDF"
      >
        Export PDF
      </button>
      {exportPdfError && (
        <span className="export-pdf-error" role="alert">{exportPdfError}</span>
      )}

      {(placedItems.length > 0 || refImagePlacements.length > 0) && (
        <button className="clear-all-button" onClick={() => void handleClearAll()}>
          Clear All ({placedItems.length + refImagePlacements.length})
        </button>
      )}
    </div>
  );
}
