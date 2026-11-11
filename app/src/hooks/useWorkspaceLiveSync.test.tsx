import { useState } from 'react';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ApiLayoutDetail } from '@gridfinity/shared';
import { useWorkspaceLiveSync } from './useWorkspaceLiveSync';
class Events {
  static current: Events; onopen: (() => void) | null = null; onerror: (() => void) | null = null;
  listeners = new Map<string, () => void>(); closed = false;
  constructor() { Events.current = this; }
  addEventListener(name: string, fn: () => void) { this.listeners.set(name, fn); }
  close() { this.closed = true; }
}
let server: ApiLayoutDetail;
let writes: Array<{ baseRevision: number; name: string }>;
let hold: Promise<void> | undefined;
let loseAcknowledgement: boolean;
const content = (name: string) => JSON.stringify({ name, gridX: 4, gridY: 4, gridResolution: 2, widthMm: 168, depthMm: 168, spacerHorizontal: 'none', spacerVertical: 'none', placedItems: [], refImagePlacements: [] });
beforeEach(() => {
  server = { ...JSON.parse(content('Shared drawer')), id: 1, revision: 1, placedItems: [] } as ApiLayoutDetail;
  writes = []; hold = undefined; loseAcknowledgement = false;
  vi.stubGlobal('EventSource', Events);
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'PUT') {
      const data = JSON.parse(String(options.body)); writes.push(data);
      if (hold) { const pending = hold; hold = undefined; await pending; }
      if (data.baseRevision !== server.revision) return new Response(JSON.stringify({ error: { message: 'This configuration changed' } }), { status: 409 });
      server = { ...server, ...data, revision: server.revision! + 1 };
      if (loseAcknowledgement) throw new TypeError('Lost response');
    }
    return new Response(JSON.stringify({ data: server }));
  }));
});
afterEach(() => vi.unstubAllGlobals());
async function mount() {
  const hook = renderHook(() => {
    const [text, setText] = useState(content(server.name));
    const [revision, setRevision] = useState(server.revision);
    const [dirty, setDirty] = useState(false);
    const sync = useWorkspaceLiveSync({ id: 1, revision, content: text, dirty,
      apply: detail => { setText(content(detail.name)); setRevision(detail.revision); setDirty(false); },
      saved: (detail, unchanged) => { setRevision(detail.revision); if (unchanged) setDirty(false); },
    });
    return { sync, text, dirty, revision, markDirty: () => setDirty(true), edit: (name: string) => { setText(content(name)); setDirty(true); } };
  });
  act(() => Events.current.onopen?.());
  await waitFor(() => expect(hook.result.current.sync.connected).toBe(true));
  return hook;
}
it('receives client changes in the workspace and automatically saves host changes at the current revision', async () => {
  const { result, unmount } = await mount();
  server = { ...server, name: 'Client change', revision: 2 };
  act(() => Events.current.listeners.get('changed')?.());
  await waitFor(() => expect(result.current.text).toBe(content('Client change')));
  act(() => result.current.edit('Host change'));
  await waitFor(() => expect(result.current.dirty).toBe(false));
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ name: 'Host change', baseRevision: 2 });
  expect(result.current.revision).toBe(3); unmount();
});
it('does not save derived readiness changes that leave the actual layout unchanged', async () => {
  const { result, unmount } = await mount();
  act(() => result.current.markDirty());
  await waitFor(() => expect(result.current.dirty).toBe(false));
  expect(writes).toHaveLength(0); unmount();
});
it('retains conflicting drafts until the host explicitly chooses to keep their workspace changes', async () => {
  const { result, unmount } = await mount();
  act(() => result.current.edit('Local draft'));
  server = { ...server, name: 'Client change', revision: 2 };
  act(() => Events.current.listeners.get('changed')?.());
  await waitFor(() => expect(result.current.sync.conflict).toBe(true));
  expect(result.current.text).toBe(content('Local draft')); expect(writes).toHaveLength(0);
  act(() => result.current.sync.keepLocal());
  await waitFor(() => expect(result.current.dirty).toBe(false));
  expect(writes[0]).toMatchObject({ baseRevision: 2, name: 'Local draft' }); expect(server.revision).toBe(3); unmount();
});
it('can discard a conflicting draft without writing over the client version', async () => {
  const { result, unmount } = await mount();
  act(() => result.current.edit('Local draft'));
  server = { ...server, name: 'Client version', revision: 2 };
  act(() => Events.current.listeners.get('changed')?.());
  await waitFor(() => expect(result.current.sync.conflict).toBe(true));
  act(() => result.current.sync.useLatest());
  await waitFor(() => expect(result.current.text).toBe(content('Client version')));
  expect(result.current.dirty).toBe(false); expect(writes).toHaveLength(0); unmount();
});
it('queues edits made while a save is in flight without clearing the newer draft', async () => {
  let release!: () => void; hold = new Promise<void>(resolve => { release = resolve; });
  const { result, unmount } = await mount();
  act(() => result.current.edit('First change'));
  await waitFor(() => expect(writes).toHaveLength(1));
  act(() => result.current.edit('Second change'));
  await act(async () => { release(); });
  await waitFor(() => expect(writes).toHaveLength(2));
  await waitFor(() => expect(result.current.dirty).toBe(false));
  expect(writes[1]).toMatchObject({ baseRevision: 2, name: 'Second change' }); expect(server.name).toBe('Second change'); unmount();
});
it('does not blindly replay an ambiguously acknowledged save', async () => {
  loseAcknowledgement = true;
  const { result, unmount } = await mount();
  act(() => result.current.edit('Possibly saved'));
  await waitFor(() => expect(result.current.sync.conflict).toBe(true));
  expect(writes).toHaveLength(1); expect(result.current.text).toBe(content('Possibly saved')); expect(server.revision).toBe(2);
  act(() => result.current.sync.useLatest());
  await waitFor(() => expect(result.current.dirty).toBe(false));
  expect(writes).toHaveLength(1); unmount();
});
it('keeps offline edits and checks the current version before resuming automatic saves', async () => {
  const { result, unmount } = await mount();
  act(() => window.dispatchEvent(new Event('offline')));
  act(() => result.current.edit('Offline draft'));
  expect(result.current.sync.connected).toBe(false);
  server = { ...server, name: 'Client while offline', revision: 2 };
  act(() => window.dispatchEvent(new Event('online')));
  act(() => Events.current.onopen?.());
  await waitFor(() => expect(result.current.sync.conflict).toBe(true));
  expect(result.current.text).toBe(content('Offline draft')); expect(writes).toHaveLength(0); unmount();
});
