import { useState, useEffect, useRef } from 'react';
import type { ApiBomGeneration, BOMItem } from '@gridfinity/shared';
import { triggerBomGeneration, getBomGeneration, getFileDownloadUrl } from '../api/bomGeneration.api';

interface BomGenerationPanelProps {
  layoutId: number | null;
  bomItems: BOMItem[];
  accessToken: string | null;
}

export function BomGenerationPanel({ layoutId, bomItems, accessToken }: BomGenerationPanelProps) {
  const [generation, setGeneration] = useState<ApiBomGeneration | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const fetchGeneration = async () => {
    if (!layoutId || !accessToken) return;
    try {
      const gen = await getBomGeneration(layoutId, accessToken);
      setGeneration(gen);
      if (gen?.status !== 'generating') stopPolling();
    } catch {
      stopPolling();
    }
  };

  useEffect(() => {
    void fetchGeneration();
    return stopPolling;
  }, [layoutId, accessToken]);

  useEffect(() => {
    if (generation?.status === 'generating') {
      pollRef.current = setInterval(() => { void fetchGeneration(); }, 3000);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [generation?.status]);

  const handleGenerate = async () => {
    if (!layoutId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const gen = await triggerBomGeneration(layoutId, bomItems, accessToken);
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
          disabled={isGenerating || !layoutId}
        >
          {isGenerating ? 'Generating\u2026' : hasGeneration ? 'Regenerate' : 'Generate'}
        </button>
        <button
          type="button"
          className="bom-gen-btn"
          disabled={!isReady || !downloadUrl}
          onClick={() => { if (downloadUrl) window.location.href = downloadUrl; }}
        >
          Download 3MF
        </button>
      </div>
      {isReady && generation?.generatedAt && (
        <div className="bom-gen-status">
          Generated {new Date(generation.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
