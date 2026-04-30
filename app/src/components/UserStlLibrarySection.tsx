import { useState } from 'react';
import type { ApiUserStl } from '@gridfinity/shared';
import { useUserStlsQuery } from '../hooks/useUserStls';
import { UserStlUploadModal } from './UserStlUploadModal';
import { UserStlEditModal } from './UserStlEditModal';
import { getUserStlImageUrl } from '../api/userStls.api';

export function UserStlLibrarySection() {
  const { data: items = [], isLoading } = useUserStlsQuery();
  const [showUpload, setShowUpload] = useState(false);
  const [editItem, setEditItem] = useState<ApiUserStl | null>(null);

  if (isLoading) return <div className="library-loading">Loading…</div>;

  return (
    <div className="user-stl-library-section">
      <div className="library-section-header">
        <span>My Models</span>
        <button className="upload-model-btn" onClick={() => setShowUpload(true)}>
          Upload model
        </button>
      </div>

      {items.length === 0 && (
        <div className="library-empty-state">No models yet — upload your first one</div>
      )}

      {items.map((item) => (
        <UserStlItem key={item.id} item={item} onEdit={() => setEditItem(item)} />
      ))}

      {showUpload && <UserStlUploadModal onClose={() => setShowUpload(false)} />}
      {editItem && <UserStlEditModal item={editItem} onClose={() => setEditItem(null)} />}
    </div>
  );
}

interface UserStlItemProps {
  item: ApiUserStl;
  onEdit: () => void;
}

function UserStlItem({ item, onEdit }: UserStlItemProps) {
  const isReady = item.status === 'ready';
  const isActive = item.status === 'pending' || item.status === 'processing';

  const dragData = JSON.stringify({ type: 'library', itemId: `user-stl:${item.id}` });

  return (
    <div
      className={`user-stl-item${isReady ? ' user-stl-item--ready' : ''}`}
      draggable={isReady}
      onDragStart={(e) => {
        if (!isReady) return;
        e.dataTransfer.setData('application/json', dragData);
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      {item.imageUrl && isReady && (
        <img
          className="user-stl-thumb"
          src={getUserStlImageUrl(item.id, item.imageUrl)}
          alt={item.name}
        />
      )}
      <span className="user-stl-name">{item.name}</span>

      {isActive && (
        <span className="user-stl-badge" title="Processing…" aria-label="Processing">⏳</span>
      )}
      {item.status === 'error' && (
        <span
          className="user-stl-badge user-stl-badge--error"
          title={item.errorMessage ?? 'Processing failed'}
          aria-label="Error"
        >⚠</span>
      )}

      <button className="user-stl-edit-btn" onClick={onEdit} aria-label={`Edit ${item.name}`}>✎</button>
    </div>
  );
}
