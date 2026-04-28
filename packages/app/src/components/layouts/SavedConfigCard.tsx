import { useState } from 'react';
import type { ApiLayout } from '@gridfinity/shared';
import { API_BASE_URL } from '../../api/apiClient';

const CELL = 8;
const PAD = 3;

function LayoutThumbnail({ thumbnailUrl, gridX, gridY }: { thumbnailUrl: string | null; gridX: number; gridY: number }) {
  if (thumbnailUrl) {
    return (
      <img
        src={`${API_BASE_URL}${thumbnailUrl}`}
        alt=""
        aria-hidden="true"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    );
  }

  const w = gridX * CELL + PAD * 2;
  const h = gridY * CELL + PAD * 2;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" aria-hidden="true">
      {Array.from({ length: gridY }, (_, row) =>
        Array.from({ length: gridX }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            className="grid-cell"
            x={PAD + col * CELL + 1}
            y={PAD + row * CELL + 1}
            width={CELL - 2}
            height={CELL - 2}
            rx={1}
          />
        ))
      )}
    </svg>
  );
}

interface SavedConfigCardProps {
  layout: ApiLayout;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onDuplicate: (id: number) => void;
  isDeleting: boolean;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function SavedConfigCard({
  layout,
  onEdit,
  onDelete,
  onDuplicate,
  isDeleting,
}: SavedConfigCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="saved-config-card">
      <div className="saved-config-thumbnail">
        <LayoutThumbnail thumbnailUrl={layout.thumbnailUrl} gridX={layout.gridX} gridY={layout.gridY} />
      </div>

      <div className="saved-config-info">
        <div className="saved-config-name-row">
          <span className="saved-config-name">{layout.name}</span>
        </div>
        <span className="saved-config-date">Saved {formatDate(layout.updatedAt)}</span>
      </div>

      <div className="saved-config-actions">
        <button
          className="saved-config-btn"
          onClick={() => onEdit(layout.id)}
          type="button"
        >
          Edit
        </button>
        <button
          className="saved-config-btn"
          onClick={() => onDuplicate(layout.id)}
          type="button"
        >
          Duplicate
        </button>
        {confirmDelete ? (
          <button
            className="saved-config-btn saved-config-delete confirming"
            onClick={() => {
              onDelete(layout.id);
              setConfirmDelete(false);
            }}
            onBlur={() => setConfirmDelete(false)}
            disabled={isDeleting}
            type="button"
          >
            Confirm
          </button>
        ) : (
          <button
            className="saved-config-btn saved-config-delete"
            onClick={() => setConfirmDelete(true)}
            disabled={isDeleting}
            type="button"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
