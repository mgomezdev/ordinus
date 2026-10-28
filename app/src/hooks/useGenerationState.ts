import { useState, useCallback, useEffect, useRef } from 'react';
import { useGenerationEvents } from './useGenerationEvents';
import type { GenerationEvent } from './useGenerationEvents';
import { getGenerationStatusApi } from '../api/generation.api';

export type GenerationStatus = 'pending' | 'complete' | 'failed';

export interface GenerationEntry {
  status: GenerationStatus;
  hash: string;
}

export interface UseGenerationStateReturn {
  getEntry(hash: string): GenerationEntry | undefined;
  trackHash(hash: string, initialStatus?: GenerationStatus): void;
}

const POLL_INTERVAL_MS = 10_000;

export function useGenerationState(apiBase: string): UseGenerationStateReturn {
  const [entries, setEntries] = useState<Map<string, GenerationEntry>>(new Map());
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

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

  // Backstop for a dropped SSE connection: EventSource reconnects silently
  // and does not replay missed messages, which can otherwise leave a hash
  // stuck on 'pending' forever. Poll still-pending hashes periodically, and
  // once immediately on every (re)connect so state catches up without
  // waiting for the next tick.
  const pollPendingHashes = useCallback(() => {
    const pending = Array.from(entriesRef.current.values()).filter((e) => e.status === 'pending');
    if (pending.length === 0) return;
    void Promise.all(
      pending.map(async (entry) => {
        try {
          const { status } = await getGenerationStatusApi(entry.hash);
          return { hash: entry.hash, status };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      setEntries((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const result of results) {
          if (!result || (result.status !== 'complete' && result.status !== 'failed')) continue;
          const current = next.get(result.hash);
          if (!current || current.status !== 'pending') continue;
          next.set(result.hash, { hash: result.hash, status: result.status });
          changed = true;
        }
        return changed ? next : prev;
      });
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(pollPendingHashes, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollPendingHashes]);

  useGenerationEvents(apiBase, onEvent, pollPendingHashes);

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
