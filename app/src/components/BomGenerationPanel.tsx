import { useState, useEffect, useRef, useCallback } from 'react';
import type { ApiBomGeneration, BOMItem } from '@gridfinity/shared';
import { triggerBomGeneration, getBomGeneration, getFileDownloadUrl, sendToThemis } from '../api/bomGeneration.api';
import { useSettings } from '../contexts/SettingsContext.js';

interface BomGenerationPanelProps {
  layoutId: number | null;
  layoutTitle: string;
  bomItems: BOMItem[];
}

export function BomGenerationPanel({ layoutId, layoutTitle, bomItems }: BomGenerationPanelProps) {
  const [generation, setGeneration] = useState<ApiBomGeneration | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [themisState, setThemisState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [themisProjectUrl, setThemisProjectUrl] = useState<string | null>(null);
  const [themisNeedsProfiles, setThemisNeedsProfiles] = useState(false);

  const { settings, health } = useSettings();
  const themisUrl = settings.themis_url;

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const fetchGeneration = useCallback(async () => {
    if (!layoutId) return;
    try {
      const gen = await getBomGeneration(layoutId);
      setGeneration(gen);
      if (gen?.status !== 'generating') stopPolling();
    } catch {
      stopPolling();
    }
  }, [layoutId, stopPolling]);

  useEffect(() => {
    void fetchGeneration();
    return stopPolling;
  }, [fetchGeneration, stopPolling]);

  useEffect(() => {
    if (generation?.status === 'generating') {
      pollRef.current = setInterval(() => { void fetchGeneration(); }, 3000);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [generation?.status, fetchGeneration, stopPolling]);

  useEffect(() => {
    if (generation?.themisProjectId && themisUrl) {
      setThemisProjectUrl(`${themisUrl}/projects/${generation.themisProjectId}`);
      setThemisState('sent');
    }
  }, [generation?.themisProjectId, themisUrl]);

  const handleSendToThemis = async () => {
    if (!layoutId) return;
    setThemisState('sending');
    setError(null);
    try {
      const { projectUrl, needsFilamentProfiles } = await sendToThemis(layoutId);
      setThemisProjectUrl(projectUrl);
      setThemisNeedsProfiles(needsFilamentProfiles ?? false);
      setThemisState('sent');
      window.open(projectUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send to Themis failed');
      setThemisState('idle');
    }
  };

  const handleGenerate = async () => {
    if (!layoutId) return;
    setLoading(true);
    setError(null);
    setThemisState('idle');
    setThemisProjectUrl(null);
    setThemisNeedsProfiles(false);
    try {
      const gen = await triggerBomGeneration(layoutId, bomItems);
      setGeneration(gen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const isGenerating = generation?.status === 'generating' || loading;
  const isReady = generation?.status === 'ready';
  const hasGeneration = generation !== null;

  const threeMfFilename = generation?.threeMfPath
    ? generation.threeMfPath.split('/').pop() ?? ''
    : '';

  const downloadUrl = isReady && layoutId && threeMfFilename
    ? getFileDownloadUrl(layoutId, threeMfFilename)
    : null;

  const handleDownload = async () => {
    if (!downloadUrl) return;
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
        setError(data?.error?.message ?? 'Download failed');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const safeTitle = layoutTitle.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'layout';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}.3mf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
    }
  };

  return (
    <div className="bom-generation-panel">
      {generation?.errorMessage && (
        <div className="bom-gen-error">{generation.errorMessage}</div>
      )}
      {error && <div className="bom-gen-error">{error}</div>}
      <div className="bom-gen-actions">
        <button
          type="button"
          className="bom-gen-btn bom-gen-btn-primary"
          onClick={handleGenerate}
          disabled={isGenerating || !layoutId || health.laminus !== 'up'}
          title={health.laminus !== 'up' ? 'Laminus is not reachable — configure it in ⚙ Settings' : undefined}
        >
          {isGenerating ? 'Generating\u2026' : hasGeneration ? 'Regenerate' : 'Generate'}
        </button>
        <button
          type="button"
          className="bom-gen-btn"
          disabled={!isReady || !downloadUrl}
          onClick={() => { void handleDownload(); }}
        >
          Download 3MF
        </button>
        {themisUrl && (
          themisState === 'sent' && themisProjectUrl ? (
            <a
              className="bom-gen-btn"
              href={themisProjectUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Themis →
            </a>
          ) : (
            <button
              type="button"
              className="bom-gen-btn"
              disabled={!isReady || themisState === 'sending' || health.themis !== 'up'}
              title={health.themis !== 'up' ? 'Themis is not reachable — configure it in ⚙ Settings' : undefined}
              onClick={() => { void handleSendToThemis(); }}
            >
              {themisState === 'sending' ? 'Sending…' : 'Send to Themis'}
            </button>
          )
        )}
      </div>
      {themisNeedsProfiles && (
        <div className="bom-gen-status">
          Project sent to Themis. Assign filament profiles to parts before generating prints.
        </div>
      )}
      {isReady && generation?.generatedAt && (
        <div className="bom-gen-status">
          Generated {new Date(generation.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
