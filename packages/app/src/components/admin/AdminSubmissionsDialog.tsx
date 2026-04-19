import { useState } from 'react';
import type { ApiLayout, ApiUserStlAdmin } from '@gridfinity/shared';
import type { LoadedLayoutConfig } from '../../types/layoutConfig';
import { useCloneLayoutMutation } from '../../hooks/useLayouts';
import { useAdminLayoutsQuery, useDeliverLayoutMutation } from '../../hooks/useAdminLayouts';

// Admin layouts may still include a status field from the server
type AdminApiLayout = ApiLayout & { status?: string };
import {
  useAdminUserStlsQuery,
  usePromoteUserStlMutation,
  useDeleteUserStlMutation,
  useReprocessUserStlMutation,
} from '../../hooks/useUserStls';
import { useAuth } from '../../contexts/AuthContext';
import { fetchLayout } from '../../api/layouts.api';
import type { PlacedItem, Rotation, SpacerMode } from '@gridfinity/shared';
import type { RefImagePlacement } from '../../hooks/useRefImagePlacements';
import { groupLayouts } from './groupLayouts';
import type { GroupMode } from './groupLayouts';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { UserStlEditModal } from '../UserStlEditModal';

interface AdminSubmissionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (config: LoadedLayoutConfig) => void;
  hasItems: boolean;
}

type FilterTab = 'submitted' | 'delivered' | 'all';
type MainSection = 'layouts' | 'user-models';

function StatusBadge({ status }: { status: string }) {
  const className = `layout-status-badge layout-status-${status}`;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={className}>{label}</span>;
}

export function AdminSubmissionsDialog({
  isOpen,
  onClose,
  onLoad,
  hasItems,
}: AdminSubmissionsDialogProps) {
  const [mainSection, setMainSection] = useState<MainSection>('layouts');
  const [filter, setFilter] = useState<FilterTab>('submitted');
  const [groupBy, setGroupBy] = useState<GroupMode>('none');
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editStl, setEditStl] = useState<ApiUserStlAdmin | null>(null);
  const { confirm, dialogProps: confirmDialogProps } = useConfirmDialog();

  const { getAccessToken } = useAuth();
  const statusFilter = filter === 'all' ? undefined : filter;
  const layoutsQuery = useAdminLayoutsQuery(statusFilter);
  const deliverMutation = useDeliverLayoutMutation();
  const cloneMutation = useCloneLayoutMutation();
  const adminUserStlsQuery = useAdminUserStlsQuery();
  const promoteMutation = usePromoteUserStlMutation();
  const deleteStlMutation = useDeleteUserStlMutation();
  const reprocessMutation = useReprocessUserStlMutation();

  if (!isOpen) return null;

  const handleLoad = async (layout: AdminApiLayout) => {
    if (hasItems) {
      const confirmed = await confirm({ title: 'Replace Layout', message: 'Replace current layout? This will remove all placed items and reference images.', variant: 'danger', confirmLabel: 'Replace', cancelLabel: 'Cancel' });
      if (!confirmed) return;
    }

    setIsLoadingDetail(true);
    setError(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const detail = await fetchLayout(token, layout.id);

      const placedItems: PlacedItem[] = detail.placedItems.map((item, index) => ({
        instanceId: `loaded-${index}`,
        itemId: `${item.libraryId}:${item.itemId}`,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation as Rotation,
        ...(item.customization ? { customization: item.customization } : {}),
      }));

      const refImagePlacements: RefImagePlacement[] = (detail.refImagePlacements ?? []).map((p, index) => ({
        id: `loaded-ref-${index}`,
        refImageId: p.refImageId,
        name: p.name,
        imageUrl: p.imageUrl,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        opacity: p.opacity,
        scale: p.scale,
        isLocked: p.isLocked,
        rotation: p.rotation as Rotation,
      }));

      onLoad({
        layoutId: detail.id,
        layoutName: detail.name,
        layoutDescription: detail.description,
        widthMm: detail.widthMm,
        depthMm: detail.depthMm,
        spacerConfig: {
          horizontal: detail.spacerHorizontal as SpacerMode,
          vertical: detail.spacerVertical as SpacerMode,
        },
        placedItems,
        refImagePlacements,
        ownerUsername: layout.ownerUsername,
        ownerEmail: layout.ownerEmail,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load layout');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleDeliver = async (e: React.MouseEvent, layoutId: number) => {
    e.stopPropagation();
    try {
      await deliverMutation.mutateAsync(layoutId);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleClone = async (e: React.MouseEvent, layoutId: number) => {
    e.stopPropagation();
    try {
      await cloneMutation.mutateAsync(layoutId);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const layouts = (layoutsQuery.data ?? []) as AdminApiLayout[];
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'submitted', label: 'Pending' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="layout-dialog-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        className="layout-dialog layout-dialog-wide"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Admin Submissions"
      >
        <div className="layout-dialog-header">
          <h2>Submissions</h2>
          <button
            className="layout-dialog-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="admin-section-tabs">
          <button
            className={`admin-filter-tab ${mainSection === 'layouts' ? 'active' : ''}`}
            onClick={() => setMainSection('layouts')}
            type="button"
          >
            Layouts
          </button>
          <button
            className={`admin-filter-tab ${mainSection === 'user-models' ? 'active' : ''}`}
            onClick={() => setMainSection('user-models')}
            type="button"
          >
            User Models
          </button>
        </div>

        {mainSection === 'layouts' && (
        <div className="admin-filter-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`admin-filter-tab ${filter === tab.key ? 'active' : ''}`}
              onClick={() => setFilter(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        )}

        {mainSection === 'layouts' && (
        <div className="admin-group-controls">
          <label htmlFor="admin-group-select">Group by</label>
          <select
            id="admin-group-select"
            className="admin-group-select"
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupMode)}
          >
            <option value="none">None</option>
            <option value="owner">Owner</option>
            <option value="lastEdited">Last Edited</option>
          </select>
        </div>
        )}

        <div className="layout-dialog-body">
        {mainSection === 'user-models' && (
          <UserModelsPanel
            query={adminUserStlsQuery}
            promoteMutation={promoteMutation}
            deleteStlMutation={deleteStlMutation}
            reprocessMutation={reprocessMutation}
            editStl={editStl}
            onEdit={setEditStl}
            onCloseEdit={() => setEditStl(null)}
            formatDate={formatDate}
          />
        )}
        {mainSection === 'layouts' && (<>
          {isLoadingDetail && (
            <div className="layout-loading-overlay">Loading layout...</div>
          )}

          {error && (
            <div className="layout-error-message">{error}</div>
          )}

          {layoutsQuery.isError && (
            <div className="layout-error-message">
              {layoutsQuery.error?.message ?? 'Failed to load submissions'}
            </div>
          )}

          {layoutsQuery.isLoading ? (
            <div className="layout-list-loading">Loading submissions...</div>
          ) : layouts.length === 0 ? (
            <div className="layout-list-empty">
              <p>No {filter === 'all' ? '' : filter} submissions.</p>
            </div>
          ) : (
            <div className="layout-list">
              {groupLayouts(layouts as ApiLayout[], groupBy).map(group => (
                <div key={group.label}>
                  {groupBy !== 'none' && (
                    <h3 className="admin-group-header">{group.label}</h3>
                  )}
                  {(group.layouts as AdminApiLayout[]).map(layout => (
                    <div
                      key={layout.id}
                      className="layout-list-item"
                      onClick={() => handleLoad(layout)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleLoad(layout);
                        }
                      }}
                    >
                      <div className="layout-list-item-info">
                        <div className="layout-list-item-name-row">
                          <span className="layout-list-item-name">{layout.name}</span>
                          {layout.status && <StatusBadge status={layout.status} />}
                        </div>
                        <div className="layout-list-item-meta">
                          <span>{layout.gridX} x {layout.gridY} grid</span>
                          <span>{formatDate(layout.updatedAt)}</span>
                          {layout.ownerUsername && (
                            <span>by {layout.ownerUsername}</span>
                          )}
                        </div>
                      </div>
                      <div className="layout-list-item-actions">
                        {layout.status === 'submitted' && (
                          <button
                            className="layout-action-btn layout-deliver-action"
                            onClick={e => handleDeliver(e, layout.id)}
                            type="button"
                            disabled={deliverMutation.isPending}
                            aria-label={`Deliver ${layout.name}`}
                          >
                            {deliverMutation.isPending ? 'Delivering...' : 'Mark Delivered'}
                          </button>
                        )}
                        {layout.status === 'delivered' && (
                          <button
                            className="layout-action-btn layout-clone-action"
                            onClick={e => handleClone(e, layout.id)}
                            type="button"
                            disabled={cloneMutation.isPending}
                            aria-label={`Clone ${layout.name}`}
                          >
                            Clone
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>)}
        </div>
        <ConfirmDialog {...confirmDialogProps} />
      </div>
    </div>
  );
}

interface UserModelsPanelProps {
  query: ReturnType<typeof useAdminUserStlsQuery>;
  promoteMutation: ReturnType<typeof usePromoteUserStlMutation>;
  deleteStlMutation: ReturnType<typeof useDeleteUserStlMutation>;
  reprocessMutation: ReturnType<typeof useReprocessUserStlMutation>;
  editStl: ApiUserStlAdmin | null;
  onEdit: (item: ApiUserStlAdmin) => void;
  onCloseEdit: () => void;
  formatDate: (dateStr: string) => string;
}

function UserModelsPanel({
  query,
  promoteMutation,
  deleteStlMutation,
  reprocessMutation,
  editStl,
  onEdit,
  onCloseEdit,
  formatDate,
}: UserModelsPanelProps) {
  const userStls = query.data ?? [];

  if (query.isLoading) return <div className="layout-list-loading">Loading user models...</div>;
  if (query.isError) return <div className="layout-error-message">{query.error?.message ?? 'Failed to load user models'}</div>;
  if (userStls.length === 0) return <div className="layout-list-empty"><p>No user models uploaded yet.</p></div>;

  return (
    <>
      <div className="layout-list">
        {userStls.map((item) => (
          <div key={item.id} className="layout-list-item">
            <div className="layout-list-item-info">
              <div className="layout-list-item-name-row">
                <span className="layout-list-item-name">{item.name}</span>
                <span className={`layout-status-badge layout-status-${item.status}`}>
                  {item.status}
                </span>
              </div>
              <div className="layout-list-item-meta">
                <span>{item.userName}</span>
                <span>{item.originalFilename}</span>
                {item.gridX != null && item.gridY != null && (
                  <span>{item.gridX} × {item.gridY}</span>
                )}
                <span>{formatDate(item.updatedAt)}</span>
              </div>
              {item.status === 'error' && item.errorMessage && (
                <div className="layout-error-message" title={item.errorMessage}>
                  {item.errorMessage.length > 80 ? item.errorMessage.slice(0, 80) + '…' : item.errorMessage}
                </div>
              )}
            </div>
            <div className="layout-list-item-actions">
              <button
                className="layout-action-btn"
                onClick={() => void reprocessMutation.mutateAsync(item.id)}
                type="button"
                disabled={reprocessMutation.isPending}
              >
                Reprocess
              </button>
              <button
                className="layout-action-btn"
                onClick={() => onEdit(item)}
                type="button"
              >
                Edit
              </button>
              <a
                className="layout-action-btn"
                href={`/api/v1/user-stls/${item.id}/file`}
                download={item.originalFilename}
              >
                Download
              </a>
              <button
                className="layout-action-btn layout-deliver-action"
                onClick={() => void deleteStlMutation.mutateAsync(item.id)}
                type="button"
                disabled={deleteStlMutation.isPending}
              >
                Delete
              </button>
              {item.status === 'ready' && (
                <button
                  className="layout-action-btn layout-submit-action"
                  onClick={() => void promoteMutation.mutateAsync(item.id)}
                  type="button"
                  disabled={promoteMutation.isPending}
                  aria-label={`Promote ${item.name}`}
                >
                  Promote
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editStl && <UserStlEditModal item={editStl} onClose={onCloseEdit} />}
    </>
  );
}
