import { useEffect } from 'react';

export interface GenerationEvent {
  type: 'generation:complete' | 'generation:failed';
  hash: string;
  error?: string;
}

export function useGenerationEvents(
  apiBase: string,
  onEvent: (event: GenerationEvent) => void,
  onOpen?: () => void,
): void {
  useEffect(() => {
    const es = new EventSource(`${apiBase}/generation/events`, { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as GenerationEvent;
        onEvent(data);
      } catch { /* ignore malformed */ }
    };
    // Fires on the initial connection AND after the browser's automatic
    // reconnect on a dropped connection. A reconnect does not replay missed
    // messages, so callers use this to re-check state they were tracking.
    if (onOpen) es.onopen = () => onOpen();
    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]); // onEvent/onOpen intentionally not in deps — callers must stabilize with useCallback
}
