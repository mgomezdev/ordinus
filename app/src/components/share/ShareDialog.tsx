import { useState, useCallback, useEffect } from 'react';
import type { ApiSharedProject } from '@gridfinity/shared';
import { useAuth } from '../../contexts/AuthContext';
import { createShareLink, getSharesByLayout, deleteShareLink } from '../../api/shared.api';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  layoutId: number;
}

export function ShareDialog({ isOpen, onClose, layoutId }: ShareDialogProps) {
  if (!isOpen) return null;
  return <ShareDialogContent onClose={onClose} layoutId={layoutId} />;
}

function ShareDialogContent({ onClose, layoutId }: Omit<ShareDialogProps, 'isOpen'>) {
  const { getAccessToken } = useAuth();
  const [shares, setShares] = useState<ApiSharedProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await getSharesByLayout(token, layoutId);
      setShares(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shares');
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken, layoutId]);

  useEffect(() => {
    loadShares();
  }, [loadShares]);

  const handleCreateShare = async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsCreating(true);
    setError(null);
    try {
      const days = expiresInDays ? parseInt(expiresInDays, 10) : undefined;
      await createShareLink(token, layoutId, days);
      setExpiresInDays('');
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (shareId: number) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await deleteShareLink(token, shareId);
      setShares(prev => prev.filter(s => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete share');
    }
  };

  const handleCopy = async (slug: string) => {
    const url = `${window.location.origin}/shared/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      // Fallback: select text in a temporary input
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    }
  };

  return (
    <div className="layout-dialog-overlay" onClick={onClose}>
      <div className="layout-dialog" onClick={e => e.stopPropagation()}>
        <div className="layout-dialog-header">
          <h2>Share Layout</h2>
          <button className="layout-dialog-close" onClick={onClose} aria-label="Close">x</button>
        </div>
        <div className="layout-dialog-body">
          {error && <div className="layout-error-message">{error}</div>}

          <div className="share-create-section">
            <label>
              Expires in (days, optional):
              <input
                type="number"
                min="1"
                max="365"
                value={expiresInDays}
                onChange={e => setExpiresInDays(e.target.value)}
                placeholder="No expiry"
                className="share-expiry-input"
              />
            </label>
            <button
              onClick={handleCreateShare}
              disabled={isCreating}
              className="layout-toolbar-btn layout-save-btn"
            >
              {isCreating ? 'Creating...' : 'Create Share Link'}
            </button>
          </div>

          {isLoading ? (
            <p>Loading shares...</p>
          ) : shares.length === 0 ? (
            <p className="share-empty">No share links yet. Create one above.</p>
          ) : (
            <ul className="share-list">
              {shares.map(share => (
                <li key={share.id} className="share-list-item">
                  <div className="share-info">
                    <code className="share-slug">{share.slug}</code>
                    <span className="share-views">{share.viewCount} views</span>
                    {share.expiresAt && (
                      <span className="share-expiry">
                        Expires: {new Date(share.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="share-actions">
                    <button
                      onClick={() => handleCopy(share.slug)}
                      className="share-copy-btn"
                    >
                      {copiedSlug === share.slug ? 'Copied!' : 'Copy URL'}
                    </button>
                    <button
                      onClick={() => handleDelete(share.id)}
                      className="layout-delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="layout-dialog-actions">
          <button onClick={onClose} className="layout-toolbar-btn">Close</button>
        </div>
      </div>
    </div>
  );
}
