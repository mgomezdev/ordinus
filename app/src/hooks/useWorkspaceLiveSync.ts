import { useEffect, useRef, useState } from 'react';
import type { ApiLayoutDetail, CreateLayoutRequest } from '@gridfinity/shared';
import { apiFetch, ApiError, API_BASE_URL } from '../api/apiClient';
import { updateLayout } from '../api/layouts.api';

interface Input {
  id: number | null; revision?: number; content: string; dirty: boolean;
  apply: (detail: ApiLayoutDetail) => void;
  saved: (detail: ApiLayoutDetail, unchanged: boolean) => void;
}
interface Session {
  id: number; revision?: number; baseline: string; enabled: boolean; connected: boolean;
  applying: boolean; open: boolean; stopped: boolean; refreshing: boolean; again: boolean;
  remote?: ApiLayoutDetail; failed?: string; pending?: Promise<void>; events?: EventSource;
  detail?: ApiLayoutDetail;
}
export function useWorkspaceLiveSync(input: Input) {
  const latest = useRef(input), session = useRef<Session | null>(null);
  const refresh = useRef<() => Promise<void>>(async () => {});
  const [status, setStatus] = useState({ enabled: false, connected: false, saving: false, problem: '', conflict: false });
  const [version, setVersion] = useState(0);
  const [participants, setParticipants] = useState<string[]>([]);
  useEffect(() => { latest.current = input; });
  useEffect(() => {
    setStatus({ enabled: latest.current.revision !== undefined && !!input.id, connected: false, saving: false, problem: '', conflict: false });
    if (!input.id || typeof EventSource === 'undefined') return;
    const current: Session = { id: input.id, revision: latest.current.revision, baseline: latest.current.content, enabled: latest.current.revision !== undefined,
      connected: false, applying: false, open: false, stopped: false, refreshing: false, again: false };
    session.current = current;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const active = () => session.current === current && !current.stopped;
    const receive = async () => {
      if (!active()) return;
      if (current.refreshing || current.pending || current.applying) { current.again = true; return; }
      current.refreshing = true;
      try {
        do {
          current.again = false;
          const { data, participants: names } = await apiFetch<{ data: ApiLayoutDetail; participants?: string[] }>(`/layouts/${current.id}/live/workspace`);
          if (!active()) return;
          current.connected = current.open;
          current.enabled = data.revision !== undefined;
          current.detail = data;
          setParticipants(names ?? []);
          if (data.revision !== current.revision) {
            if (latest.current.content !== current.baseline) {
              current.remote = data;
              setStatus(value => ({ ...value, enabled: current.enabled, connected: current.connected, conflict: true, problem: 'The shared drawer changed while you had local edits. Your workspace changes are kept. Review both versions before choosing what to keep.' }));
            } else {
              current.revision = data.revision; current.applying = true; current.remote = undefined;
              latest.current.apply(data);
              setVersion(value => value + 1);
              setStatus({ enabled: current.enabled, connected: current.connected, saving: false, problem: '', conflict: false });
            }
          } else setStatus(value => ({ ...value, enabled: current.enabled, connected: current.connected }));
        } while (current.again && active() && !current.applying);
      } catch (error) {
        if (!active()) return;
        current.connected = false;
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) { current.stopped = true; current.events?.close(); }
        setStatus(value => ({ ...value, connected: false, problem: 'Live updates are unavailable. Local workspace changes are kept.' }));
      } finally { current.refreshing = false; }
    };
    refresh.current = receive;
    const connect = () => {
      if (!active()) return;
      clearTimeout(retry); current.events?.close();
      const events = new EventSource(`${API_BASE_URL}/layouts/${current.id}/live/events`, { withCredentials: true }); current.events = events;
      events.onopen = () => { if (current.events === events && active()) { current.open = true; void receive(); } };
      events.addEventListener('changed', () => { if (current.events === events && active()) void receive(); });
      events.addEventListener('closed', () => { if (current.events === events && active()) { current.stopped = true; current.connected = false; events.close(); setStatus(value => ({ ...value, connected: false, problem: 'Sign in again to reconnect this workspace.' })); } });
      events.onerror = () => {
        if (current.events !== events || !active()) return;
        current.open = false; current.connected = false; events.close();
        setStatus(value => ({ ...value, connected: false }));
        retry = setTimeout(() => { if (navigator.onLine !== false) connect(); }, 2000);
      };
    };
    const offline = () => { current.open = false; current.connected = false; clearTimeout(retry); current.events?.close(); setStatus(value => ({ ...value, connected: false })); };
    window.addEventListener('offline', offline); window.addEventListener('online', connect);
    connect();
    return () => { current.stopped = true; current.events?.close(); clearTimeout(retry); if (session.current === current) session.current = null; window.removeEventListener('offline', offline); window.removeEventListener('online', connect); };
  }, [input.id]);

  async function flush(): Promise<void> {
    const current = session.current;
    if (!current?.enabled) return;
    if (current.pending) { await current.pending; return flush(); }
    if (current.remote) throw new Error('Review the conflicting workspace changes first.');
    if (!current.connected) throw new Error('Reconnect before sharing workspace changes.');
    const sent = latest.current.content;
    if (sent === current.baseline || current.applying) return;
    const baseRevision = current.revision;
    setStatus(value => ({ ...value, saving: true, problem: '' }));
    const work = (async () => {
      try {
        const detail = await updateLayout(current.id, { ...JSON.parse(sent) as CreateLayoutRequest, baseRevision });
        if (session.current !== current || current.stopped) return;
        current.revision = detail.revision; current.baseline = sent; current.detail = detail; current.failed = undefined;
        latest.current.saved(detail, latest.current.content === sent);
        setStatus(value => ({ ...value, saving: false, problem: '' }));
      } catch (error) {
        if (session.current !== current || current.stopped) return;
        current.failed = sent;
        setStatus(value => ({ ...value, saving: false, problem: error instanceof ApiError && error.status < 500 ? error.message : 'The last save could not be confirmed. Your local changes are kept. Check the shared drawer before retrying.' }));
        current.again = true;
        throw error;
      } finally {
        current.pending = undefined;
        if (session.current === current && !current.stopped) {
          if (current.again) void refresh.current();
          setVersion(value => value + 1);
        }
      }
    })();
    current.pending = work;
    return work;
  }
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  useEffect(() => {
    const current = session.current;
    if (!current) return;
    if (current.applying) { current.applying = false; current.baseline = input.content; if (current.again) void refresh.current(); return; }
    if (!input.dirty && input.revision !== current.revision && !current.pending && !current.remote) { current.revision = input.revision; current.baseline = input.content; }
    // Library/model readiness can recompute placement validity without changing
    // the saved payload. It must not leave an otherwise saved workspace dirty.
    if (current.enabled && !current.pending && !current.remote && input.content === current.baseline && input.dirty && current.detail && current.detail.revision === current.revision) {
      latest.current.saved(current.detail, true); return;
    }
    if (!current.enabled || !current.connected || current.remote || current.pending || input.content === current.baseline || input.content === current.failed) return;
    const timer = setTimeout(() => { void flushRef.current().catch(() => {}); }, 350);
    return () => clearTimeout(timer);
  }, [input.content, input.dirty, input.revision, status.connected, version]);
  return { ...status, participants, flush,
    useLatest: () => {
      const current = session.current; if (!current?.remote) return;
      current.revision = current.remote.revision; current.applying = true; current.failed = undefined;
      latest.current.apply(current.remote); current.remote = undefined;
      setVersion(value => value + 1);
      setStatus(value => ({ ...value, conflict: false, problem: '' }));
    },
    keepLocal: () => {
      const current = session.current; if (!current?.remote) return;
      current.revision = current.remote.revision; latest.current.saved(current.remote, false); current.remote = undefined; current.failed = undefined;
      setStatus(value => ({ ...value, conflict: false, problem: '' })); setVersion(value => value + 1);
    },
  };
}
export type WorkspaceLiveSync = ReturnType<typeof useWorkspaceLiveSync>;
