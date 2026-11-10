import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LiveSnapshot, LiveCommand } from '@gridfinity/shared';
import { LiveEditor } from './LiveEditor';
class Events {
  static current: Events; onopen: (() => void) | null = null; onerror: (() => void) | null = null;
  listeners = new Map<string, () => void>();
  constructor() { Events.current = this; }
  addEventListener(name: string, fn: () => void) { this.listeners.set(name, fn); }
  close() {}
}
const stableId = 'e31b0987-e60c-4dd1-9f0a-14ef41316e79';
let state: LiveSnapshot;
let writes: LiveCommand[];
beforeEach(() => {
  writes = [];
  state = { revision: 1, participants: [{ id: 'owner', name: 'Organizer', role: 'owner' }], catalog: [{ key: 'small', name: 'Small bin', width: 1, depth: 1 }],
    bins: [{ id: 1, stableId, customizable: true, height: 4, lipStyle: 'normal', wallPatternEnabled: false }],
    layout: { name: 'Shared kitchen', gridX: 4, gridY: 4, gridResolution: 2, widthMm: 168, depthMm: 168, spacerHorizontal: 'none', spacerVertical: 'none', savedAt: '2026-11-09', referenceImages: [],
      bins: [{ id: 1, name: 'Tray', x: 0, y: 0, width: 2, depth: 2, rotation: 0, heightUnits: 4 }] } };
  vi.stubGlobal('EventSource', Events);
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') return new Response(null, { status: 204 });
    if (options?.method === 'POST') {
      const command = JSON.parse(String(options.body)) as LiveCommand; writes.push(command);
      if (command.baseRevision !== state.revision) return new Response(JSON.stringify({ error: { message: 'Someone changed this drawer' } }), { status: 409 });
      state.revision++; return new Response(JSON.stringify({ revision: state.revision }));
    }
    return new Response(JSON.stringify(url.endsWith('/models') ? { bins: [] } : state));
  }));
});
afterEach(() => vi.unstubAllGlobals());
async function mount(owner = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const exit = vi.fn();
  const view = render(<QueryClientProvider client={client}><LiveEditor base="/test/live" owner={owner} onExit={exit} /></QueryClientProvider>);
  await screen.findByRole('heading', { name: 'Shared kitchen' });
  act(() => Events.current.onopen?.());
  await waitFor(() => expect(screen.getByText('Live · Saved')).toBeTruthy());
  return { view, client, exit };
}
it('submits owner position, rotation, customization, addition, drawer changes and closure', async () => {
  const { view, client, exit } = await mount(true);
  fireEvent.click(screen.getByRole('button', { name: /^Bin 1:/ }));
  fireEvent.change(screen.getByLabelText('X position'), { target: { value: '1.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Move bin', exact: true }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].change).toEqual({ type: 'move', stableId, x: 3, y: 0 });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rotate right' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].change.type).toBe('rotate');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Apply bin options' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Height units (7 mm)'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Lip style'), { target: { value: 'none' } });
  fireEvent.click(screen.getByLabelText('Wall pattern'));
  fireEvent.click(screen.getByRole('button', { name: 'Apply bin options' }));
  await waitFor(() => expect(writes).toHaveLength(3));
  expect(writes[2].change).toMatchObject({ type: 'customize', height: 6, lipStyle: 'none', wallPatternEnabled: true });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add a bin' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Add a bin' }));
  fireEvent.change(screen.getByLabelText('Approved bin'), { target: { value: 'small' } });
  fireEvent.change(screen.getByLabelText('Add Y position'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Place bin' }));
  await waitFor(() => expect(writes).toHaveLength(4));
  expect(writes[3].change).toEqual({ type: 'add', catalogKey: 'small', x: 0, y: 4 });
  fireEvent.click(screen.getByRole('button', { name: 'Drawer dimensions and spacers' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Apply drawer changes' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Drawer width (mm)'), { target: { value: '210' } });
  fireEvent.change(screen.getByLabelText('Horizontal spacers'), { target: { value: 'symmetrical' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply drawer changes' }));
  await waitFor(() => expect(writes).toHaveLength(5));
  expect(writes[4].change).toMatchObject({ type: 'drawer', widthMm: 210, spacerHorizontal: 'symmetrical' });
  fireEvent.click(screen.getByRole('button', { name: 'Close live guest access' }));
  await screen.findByText('Live guest access closed. Your changes are saved.');
  fireEvent.click(screen.getByRole('button', { name: 'Back to workspace' })); expect(exit).toHaveBeenCalled();
  view.unmount(); client.clear();
});
it('retains a stale client draft and requires explicit revision review before applying it', async () => {
  const { view, client } = await mount();
  fireEvent.click(screen.getByRole('button', { name: /^Bin 1:/ }));
  fireEvent.change(screen.getByLabelText('X position'), { target: { value: '1.5' } });
  state.revision = 2; state.layout.bins[0].x = 2;
  act(() => Events.current.listeners.get('changed')?.());
  await screen.findByText('The drawer changed while these values were open. Review the current layout before retrying.');
  fireEvent.click(screen.getByRole('button', { name: 'Move bin', exact: true }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('X position') as HTMLInputElement).value).toBe('1.5');
  expect(writes[0].baseRevision).toBe(1);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Use latest revision for these values' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Use latest revision for these values' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move bin', exact: true }));
  await waitFor(() => expect(writes).toHaveLength(2)); expect(writes[1].baseRevision).toBe(2);
  act(() => Events.current.listeners.get('closed')?.());
  await screen.findByRole('heading', { name: 'Session unavailable' });
  expect(screen.queryByRole('group', { name: 'Drawer layout' })).toBeNull();
  view.unmount(); client.clear();
});
