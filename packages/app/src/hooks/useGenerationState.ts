import { useState, useCallback } from 'react';
import { useGenerationEvents } from './useGenerationEvents';
import type { GenerationEvent } from './useGenerationEvents';

export type GenerationStatus = 'pending' | 'complete' | 'failed';

export interface GenerationEntry {
  status: GenerationStatus;
  hash: string;
}

export interface UseGenerationStateReturn {
  getEntry(hash: string): GenerationEntry | undefined;
  trackHash(hash: string, initialStatus?: GenerationStatus): void;
}

export function useGenerationState(apiBase: string): UseGenerationStateReturn {
  const [entries, setEntries] = useState<Map<string, GenerationEntry>>(new Map());

  const onEvent = useCallback((event: GenerationEvent) => {
    setEntries((prev) => {
      if (!prev.has(event.hash)) return prev;
      const next = new Map(prev);
      next.set(event.hash, {
        hash: event.hash,
        status: event.type === 'generation:complete' ? 'complete' : 'failed',
      });
      return next;
    });
  }, []);

  useGenerationEvents(apiBase, onEvent);

  const trackHash = useCallback((hash: string, initialStatus: GenerationStatus = 'pending') => {
    setEntries((prev) => {
      if (prev.has(hash)) return prev;
      const next = new Map(prev);
      next.set(hash, { hash, status: initialStatus });
      return next;
    });
  }, []);

  const getEntry = useCallback(
    (hash: string) => entries.get(hash),
    [entries],
  );

  return { getEntry, trackHash };
}
