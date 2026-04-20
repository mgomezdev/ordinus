import type { ApiRefImage } from '@gridfinity/shared';
import { useRefImagesQuery } from '../hooks/useRefImages';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

interface RebindImageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (refImageId: number, imageUrl: string, name: string) => void;
}

export function RebindImageDialog({ isOpen, onClose, onSelect }: RebindImageDialogProps) {
  const refImagesQuery = useRefImagesQuery();

  if (!isOpen) return null;

  const images = refImagesQuery.data ?? [];

  const handleSelect = (img: ApiRefImage) => {
    onSelect(img.id, img.imageUrl, img.name);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="layout-dialog-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        className="layout-dialog layout-dialog-wide"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Rebind Image"
      >
        <div className="layout-dialog-header">
          <h2>Select Replacement Image</h2>
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
          {refImagesQuery.isLoading && (
            <div className="ref-image-library-loading">Loading images...</div>
          )}

          {refImagesQuery.isError && (
            <div className="ref-image-library-error" role="alert">
              {refImagesQuery.error?.message ?? 'Failed to load images'}
            </div>
          )}

          {!refImagesQuery.isLoading && !refImagesQuery.isError && images.length === 0 && (
            <p className="ref-image-empty">No images available. Upload images in the Images tab first.</p>
          )}

          {!refImagesQuery.isLoading && !refImagesQuery.isError && images.length > 0 && (
            <div className="rebind-image-grid">
              {images.map(img => (
                <button
                  key={img.id}
                  className="rebind-image-option"
                  onClick={() => handleSelect(img)}
                  type="button"
                >
                  <img
                    src={`${API_BASE_URL}/images/${img.imageUrl}`}
                    alt={img.name}
                    loading="lazy"
                    draggable={false}
                  />
                  <span className="rebind-image-name">{img.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
