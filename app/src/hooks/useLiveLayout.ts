import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LiveSnapshot, LiveChange, LiveCommand } from '@gridfinity/shared';
import { apiFetch, ApiError, API_BASE_URL } from '../api/apiClient';

export function useLiveLayout(base: string) {
  const cache = useQueryClient();
  const snapshot = useQuery({ queryKey: ['live-layout', base], queryFn: () => apiFetch<LiveSnapshot>(`${base}/snapshot`), retry: false, refetchOnMount: 'always', refetchOnWindowFocus: false });
  const refreshRef = useRef(snapshot.refetch);
  useEffect(() => { refreshRef.current = snapshot.refetch; }, [snapshot.refetch]);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting' | 'closed'>('connecting');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState<LiveCommand | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true, open = false, refreshing = false, again = false, closed = false;
    let events: EventSource;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { closed = true; clearTimeout(reconnect); events?.close(); setConnection('closed'); };
    const refresh = async () => {
      if (refreshing) { again = true; return; }
      refreshing = true;
      do {
        again = false;
        const current = await refreshRef.current({ cancelRefetch: false });
        if (!active || closed) return;
        if (current.error instanceof ApiError && [401, 403, 404, 409, 410].includes(current.error.status)) { stop(); }
        else if (current.isSuccess && open) setConnection('live');
        else setConnection('reconnecting');
        void cache.invalidateQueries({ queryKey: ['live-models', base] });
      } while (again && active);
      refreshing = false;
    };
    const connect = () => {
      if (!active || closed) return;
      clearTimeout(reconnect); events?.close();
      const source = new EventSource(`${API_BASE_URL}${base}/events`, { withCredentials: true }); events = source;
      source.onopen = () => { if (events !== source || !active) return; open = true; void refresh(); };
      source.onerror = () => {
        if (events !== source || !active || closed) return;
        open = false; source.close(); setConnection('reconnecting'); void refresh();
        clearTimeout(reconnect);
        reconnect = setTimeout(() => { if (navigator.onLine !== false) connect(); }, 2000);
      };
      source.addEventListener('changed', () => { if (events === source && active) void refresh(); });
      source.addEventListener('closed', () => { if (events === source && active) stop(); });
    };
    connect();
    const offline = () => { open = false; clearTimeout(reconnect); events.close(); setConnection('reconnecting'); };
    const online = () => { if (!closed) connect(); };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => { active = false; mounted.current = false; clearTimeout(reconnect); events.close(); window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
  }, [base, cache]);

  async function transmit(command: LiveCommand): Promise<number | undefined> {
    if (connection !== 'live' || sending) return undefined;
    setSending(true); setProblem('');
    try {
      const accepted = await apiFetch<{ revision: number }>(`${base}/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      await snapshot.refetch({ cancelRefetch: true });
      if (!mounted.current) return undefined;
      setPending(null);
      void cache.invalidateQueries({ queryKey: ['live-models', base] });
      return accepted.revision;
    } catch (err) {
      if (!mounted.current) return undefined;
      if (err instanceof ApiError && err.status < 500 && err.status !== 408) {
        setProblem(err.message); setPending(null);
        if ([401, 403, 404, 410].includes(err.status)) setConnection('closed');
        await snapshot.refetch({ cancelRefetch: false });
      } else {
        setPending(command);
        setProblem('The last change may have saved. Reconnect and retry that change to check its result.');
      }
      return undefined;
    } finally { if (mounted.current) setSending(false); }
  }
  const canEdit = connection === 'live' && !sending && !pending && !!snapshot.data;
  return { snapshot, connection, sending, problem, ambiguous: !!pending, canEdit,
    send: (change: LiveChange, baseRevision: number) => canEdit ? transmit({ commandId: crypto.randomUUID(), baseRevision, change }) : Promise.resolve(undefined),
    retry: () => pending ? transmit(pending) : Promise.resolve(undefined) };
}
