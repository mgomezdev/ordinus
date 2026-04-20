import { useEffect } from 'react';

export interface GenerationEvent {
  type: 'generation:complete' | 'generation:failed';
  hash: string;
  error?: string;
}

export function useGenerationEvents(
  apiBase: string,
  onEvent: (event: GenerationEvent) => void,
): void {
  useEffect(() => {
    const es = new EventSource(`${apiBase}/generation/events`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as GenerationEvent;
        onEvent(data);
      } catch { /* ignore malformed */ }
    };
    return () => es.close();
  }, [apiBase]); // onEvent intentionally not in deps — callers must stabilize with useCallback
}
