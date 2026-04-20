import { useRef, useState, useMemo } from 'react';
import type { ApiRefImage } from '@gridfinity/shared';
import {
  useRefImagesQuery,
  useUploadRefImageMutation,
  useUploadGlobalRefImageMutation,
  useRenameRefImageMutation,
  useDeleteRefImageMutation,
} from '../hooks/useRefImages';
import { useAuth } from '../contexts/AuthContext';
import { RefImageCard } from './RefImageCard';

export function RefImageLibrary() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const refImagesQuery = useRefImagesQuery();
  const uploadMutation = useUploadRefImageMutation();
  const uploadGlobalMutation = useUploadGlobalRefImageMutation();
  const renameMutation = useRenameRefImageMutation();
  const deleteMutation = useDeleteRefImageMutation();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'personal' | 'global'>('personal');

  const [sharedCollapsed, setSharedCollapsed] = useState(false);
  const [myCollapsed, setMyCollapsed] = useState(false);

  const { globalImages, personalImages } = useMemo(() => {
    const data = refImagesQuery.data ?? [];
    const global: ApiRefImage[] = [];
    const personal: ApiRefImage[] = [];
    for (const img of data) {
      if (img.isGlobal) global.push(img);
      else personal.push(img);
    }
    return { globalImages: global, personalImages: personal };
  }, [refImagesQuery.data]);

  const handleUploadClick = (mode: 'personal' | 'global') => {
    setUploadMode(mode);
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file');
      return;
    }

    try {
      setUploadError(null);
      if (uploadMode === 'global') {
        await uploadGlobalMutation.mutateAsync(file);
      } else {
        await uploadMutation.mutateAsync(file);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const handleRename = (id: number, newName: string) => {
    renameMutation.mutate({ id, name: newName });
  };

  const canDeleteImage = (img: ApiRefImage): boolean => {
    if (isAdmin) return true;
    if (img.isGlobal) return false;
    return true; // own images
  };

  const isUploading = uploadMutation.isPending || uploadGlobalMutation.isPending;

  return (
    <div className="ref-image-library">
      <h3 className="ref-image-library-title">Reference Images</h3>
      <p className="ref-image-library-hint">Drag images onto the grid</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label="Upload reference image"
      />

      <div className="ref-image-library-actions">
        <button
          className="ref-image-upload-btn"
          onClick={() => handleUploadClick('personal')}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : 'Upload Image'}
        </button>
        {isAdmin && (
          <button
            className="ref-image-upload-btn ref-image-upload-btn--global"
            onClick={() => handleUploadClick('global')}
            disabled={isUploading}
          >
            Upload as Shared
          </button>
        )}
      </div>

      {uploadError && (
        <div className="ref-image-library-error" role="alert">
          {uploadError}
        </div>
      )}

      {refImagesQuery.isLoading && (
        <div className="ref-image-library-loading">Loading images...</div>
      )}

      {refImagesQuery.isError && (
        <div className="ref-image-library-error" role="alert">
          {refImagesQuery.error?.message ?? 'Failed to load images'}
        </div>
      )}

      {!refImagesQuery.isLoading && !refImagesQuery.isError && (
        <>
          {globalImages.length > 0 && (
            <div className="ref-image-section">
              <h4
                className="ref-image-section-title collapsible"
                onClick={() => setSharedCollapsed(!sharedCollapsed)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSharedCollapsed(!sharedCollapsed);
                  }
                }}
              >
                <span className={`category-chevron ${sharedCollapsed ? 'collapsed' : 'expanded'}`}>
                  ▶
                </span>
                Shared Images ({globalImages.length})
              </h4>
              <div className={`ref-image-grid ${sharedCollapsed ? 'collapsed' : 'expanded'}`}>
                {globalImages.map(img => (
                  <RefImageCard
                    key={img.id}
                    image={img}
                    onDelete={canDeleteImage(img) ? handleDelete : undefined}
                    onRename={isAdmin ? handleRename : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="ref-image-section">
            <h4
              className="ref-image-section-title collapsible"
              onClick={() => setMyCollapsed(!myCollapsed)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMyCollapsed(!myCollapsed);
                }
              }}
            >
              <span className={`category-chevron ${myCollapsed ? 'collapsed' : 'expanded'}`}>
                ▶
              </span>
              My Images ({personalImages.length})
            </h4>
            <div className={`ref-image-grid ${myCollapsed ? 'collapsed' : 'expanded'}`}>
              {personalImages.length === 0 ? (
                <p className="ref-image-empty">No personal images yet. Upload one above.</p>
              ) : (
                personalImages.map(img => (
                  <RefImageCard
                    key={img.id}
                    image={img}
                    onDelete={handleDelete}
                    onRename={handleRename}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
