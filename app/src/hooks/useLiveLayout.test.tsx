import { it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLiveLayout } from './useLiveLayout';
class Events {
  static current: Events;
  onopen: (() => void) | null = null; onerror: (() => void) | null = null;
  listeners = new Map<string, () => void>(); closed = false;
  constructor() { Events.current = this; }
  addEventListener(name: string, listener: () => void) { this.listeners.set(name, listener); }
  close() { this.closed = true; }
}
afterEach(() => vi.unstubAllGlobals());
it('pauses editing when the authoritative refresh after a committed command fails, then recovers on a heartbeat', async () => {
  vi.stubGlobal('EventSource', Events);
  let readStatus = 200;
  let revision = 1;
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      revision++; readStatus = 503;
      return new Response(JSON.stringify({ revision }));
    }
    return new Response(JSON.stringify(readStatus === 200
      ? { revision, layout: { name: 'Drawer' }, bins: [], catalog: [], participants: [] }
      : { error: { message: 'Snapshot unavailable' } }), { status: readStatus });
  });
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useLiveLayout('/guest/test/live'), { wrapper });
  act(() => Events.current.onopen?.());
  await waitFor(() => expect(hook.result.current.canEdit).toBe(true));
  await act(async () => { expect(await hook.result.current.send({ type: 'remove', stableId: 'id' }, 1)).toBe(2); });
  expect(hook.result.current.canEdit).toBe(false);
  expect(hook.result.current.connection).toBe('reconnecting');
  expect(hook.result.current.ambiguous).toBe(false);
  readStatus = 200;
  act(() => Events.current.listeners.get('changed')?.());
  await waitFor(() => expect(hook.result.current.canEdit).toBe(true));
  expect(hook.result.current.snapshot.data?.revision).toBe(2);
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  hook.unmount(); client.clear();
});

it('allows only one command in flight even before React renders the saving state', async () => {
  vi.stubGlobal('EventSource', Events);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') { await gate; return new Response(JSON.stringify({ revision: 2 })); }
    return new Response(JSON.stringify({ revision: 1, layout: { name: 'Drawer' }, bins: [], catalog: [], participants: [] }));
  });
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useLiveLayout('/guest/test/live'), { wrapper });
  act(() => Events.current.onopen?.());
  await waitFor(() => expect(hook.result.current.canEdit).toBe(true));
  await act(async () => {
    const first = hook.result.current.send({ type: 'remove', stableId: 'id' }, 1);
    const second = hook.result.current.send({ type: 'remove', stableId: 'id' }, 1);
    release(); await Promise.all([first, second]);
  });
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  hook.unmount(); client.clear();
});

it.each(['network', 'gateway'] as const)('refreshes revisions, blocks disconnected edits, and deduplicates a %s failure', async failure => {
  vi.stubGlobal('EventSource', Events);
  let revision = 1; let loseAck = true;
  const ids: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const command = JSON.parse(String(options.body)) as { commandId: string };
      ids.push(command.commandId);
      if (loseAck) {
        loseAck = false; revision++;
        if (failure === 'gateway') return new Response(JSON.stringify({ error: { message: 'Bad gateway' } }), { status: 502 });
        throw new TypeError('Network lost');
      }
      return new Response(JSON.stringify({ revision, duplicate: true }));
    }
    return new Response(JSON.stringify({ revision, layout: { name: 'Drawer' }, bins: [], catalog: [], participants: [] }));
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useLiveLayout('/guest/test/live'), { wrapper });
  await waitFor(() => expect(hook.result.current.snapshot.data?.revision).toBe(1));
  act(() => Events.current.onopen?.());
  await waitFor(() => expect(hook.result.current.connection).toBe('live'));
  revision = 2;
  act(() => Events.current.listeners.get('changed')?.());
  await waitFor(() => expect(hook.result.current.snapshot.data?.revision).toBe(2));
  act(() => Events.current.onerror?.());
  await act(async () => { await hook.result.current.send({ type: 'remove', stableId: 'id' }, 2); });
  expect(ids).toHaveLength(0);
  act(() => Events.current.onopen?.());
  await waitFor(() => expect(hook.result.current.connection).toBe('live'));
  await act(async () => { await hook.result.current.send({ type: 'remove', stableId: 'id' }, 2); });
  expect(hook.result.current.ambiguous).toBe(true);
  await act(async () => { await hook.result.current.retry(); });
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
  expect(hook.result.current.ambiguous).toBe(false);
  expect(hook.result.current.snapshot.data?.revision).toBe(3);
  act(() => Events.current.listeners.get('closed')?.());
  expect(hook.result.current.connection).toBe('closed');
  hook.unmount(); client.clear(); expect(Events.current.closed).toBe(true);
});
