import { useState, useEffect, useCallback } from 'react';
import type { ApiBomGeneration } from '@gridfinity/shared';
import {
  triggerBomGeneration,
  getBomGeneration,
  getFileDownloadUrl,
} from '../../api/bomGeneration.api';
import './AdminBomPanel.css';

interface AdminBomPanelProps {
  submissionId: number;
  accessToken: string;
}

const POLL_INTERVAL_MS = 3000;

export function AdminBomPanel({ submissionId, accessToken }: AdminBomPanelProps) {
  const [generation, setGeneration] = useState<ApiBomGeneration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const gen = await getBomGeneration(submissionId, accessToken);
      setGeneration(gen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load generation status');
    } finally {
      setLoading(false);
    }
  }, [submissionId, accessToken]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Poll while generating
  useEffect(() => {
    if (generation?.status !== 'generating') return;
    const timer = setInterval(() => { void fetchStatus(); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [generation?.status, fetchStatus]);

  const handleGenerate = async () => {
    setError(null);
    try {
      const gen = await triggerBomGeneration(submissionId, accessToken);
      setGeneration(gen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    }
  };

  const isGenerating = generation?.status === 'generating';
  const isReady = generation?.status === 'ready';
  const isError = generation?.status === 'error' || !!error;

  const panelClass = [
    'admin-bom-panel',
    isGenerating ? 'admin-bom-panel--generating' : '',
    isError ? 'admin-bom-panel--error' : '',
  ].filter(Boolean).join(' ');

  const statusText = (() => {
    if (loading) return 'Loading\u2026';
    if (!generation) return 'Not yet generated';
    if (generation.status === 'generating') return 'Generating STL files\u2026';
    if (generation.status === 'ready') {
      const count = generation.fileManifest?.reduce((s, e) => s + e.qty, 0) ?? 0;
      const unique = generation.fileManifest?.length ?? 0;
      return `Files generated \u00b7 ${unique} unique config${unique !== 1 ? 's' : ''} \u00b7 ${count} items total \u00b7 ${generation.generatedAt ? new Date(generation.generatedAt).toLocaleString() : ''}`;
    }
    if (generation.status === 'error') return `Error: ${generation.errorMessage ?? 'Unknown error'}`;
    return 'Not yet generated';
  })();

  const threeMfFilename = isReady && generation?.threeMfPath
    ? generation.threeMfPath.split(/[\\/]/).pop()
    : null;

  const totalItems = generation?.fileManifest?.reduce((s, e) => s + e.qty, 0) ?? 0;

  return (
    <div className={panelClass}>
      <div className="admin-bom-panel__header">
        <div>
          <div className="admin-bom-panel__label">Admin \u2014 Order Fulfillment</div>
          <div className="admin-bom-panel__status">{statusText}</div>
        </div>
        <div className="admin-bom-panel__actions">
          <button
            type="button"
            className="admin-bom-panel__btn admin-bom-panel__btn--generate"
            onClick={() => { void handleGenerate(); }}
            disabled={isGenerating || loading}
          >
            {isGenerating ? '\u23f3 Generating\u2026' : generation ? '\u21ba Regenerate' : '\u2699 Generate Files'}
          </button>
          {isReady && threeMfFilename && (
            <a
              href={getFileDownloadUrl(submissionId, threeMfFilename)}
              download={threeMfFilename}
              className="admin-bom-panel__btn admin-bom-panel__btn--download-3mf"
            >
              \u2b07 Download 3MF ({totalItems} items)
            </a>
          )}
        </div>
      </div>

      {isReady && generation.fileManifest && (
        <div className="admin-bom-panel__stl-links">
          {generation.fileManifest.map((entry) => (
            <a
              key={entry.filename}
              href={getFileDownloadUrl(submissionId, entry.filename)}
              download={entry.filename}
              className="admin-bom-panel__stl-chip"
            >
              \u2b07 {entry.filename} \u00d7{entry.qty}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
