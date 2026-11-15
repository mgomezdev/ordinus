import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceShare } from './WorkspaceShare';

const ws = {
  layoutMeta: { id: 42 as number | null, name: 'Share test', description: 'Owner notes' },
  gridResult: { gridX: 4, gridY: 4 }, drawerWidth: 168, drawerDepth: 168,
  spacerConfig: { horizontal: 'none', vertical: 'none' }, placedItems: [], refImagePlacements: [],
  handleSaveComplete: vi.fn(),
};
vi.mock('../../contexts/WorkspaceContext', () => ({ useWorkspace: () => ws }));
vi.mock('../../contexts/CustomerContext', () => ({ useCustomers: () => ({ selectedCustomer: { id: 7 } }) }));
const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
let failSave = false;
beforeEach(() => {
  calls.length = 0; failSave = false;
  ws.layoutMeta = { id: 42, name: 'Share test', description: 'Owner notes' }; ws.drawerWidth = 168;
  ws.handleSaveComplete.mockImplementation((id: number, name: string) => { ws.layoutMeta = { ...ws.layoutMeta, id, name }; });
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';
    const body = JSON.parse(String(options?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, method, body });
    if (method === 'GET') return new Response(JSON.stringify({ data: [] }));
    if (url.endsWith('/guest-links')) return new Response(JSON.stringify({ id: 'a'.repeat(24), secret: 'invitation', createdAt: '2026-11-09T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', revokedAt: null }));
    return new Response(JSON.stringify(failSave ? { error: { message: 'Save rejected' } } : { data: { id: ws.layoutMeta.id ?? 43, name: body.name } }), { status: failSave ? 500 : 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WorkspaceShare /></QueryClientProvider>);
}
it('saves on opening and saves the latest canvas again before issuing a link', async () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Share preview', exact: true }));
  await screen.findByRole('button', { name: 'Create preview link' });
  expect(calls[0]).toMatchObject({ url: '/api/v1/layouts/42', method: 'PUT', body: { widthMm: 168, refImagePlacements: [] } });
  expect(calls.some(call => call.method === 'POST')).toBe(false);
  ws.drawerWidth = 210; view.rerender(<QueryClientProvider client={new QueryClient()}><WorkspaceShare /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Create preview link' }));
  await screen.findByLabelText('Preview link');
  const writes = calls.filter(call => call.method !== 'GET');
  expect(writes.map(call => call.method)).toEqual(['PUT', 'PUT', 'POST']);
  expect(writes[1].body.widthMm).toBe(210);
});
it('blocks link creation if either the opening save or the pre-creation save fails', async () => {
  failSave = true; mount();
  fireEvent.click(screen.getByRole('button', { name: 'Share preview', exact: true }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Create preview link' })).toBeNull();
  failSave = false;
  fireEvent.click(screen.getByRole('button', { name: 'Share preview', exact: true }));
  await screen.findByRole('button', { name: 'Create preview link' });
  failSave = true;
  fireEvent.click(screen.getByRole('button', { name: 'Create preview link' }));
  await waitFor(() => expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('Save rejected'))).toBe(true));
  expect(calls.some(call => call.method === 'POST' && call.url.endsWith('/guest-links'))).toBe(false);
});
it('names and saves a new workspace with the selected customer before sharing', async () => {
  ws.layoutMeta = { id: null, name: '', description: '' }; mount();
  fireEvent.click(screen.getByRole('button', { name: 'Share preview', exact: true }));
  fireEvent.change(screen.getByLabelText('Configuration name'), { target: { value: 'New client drawer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
  await screen.findByRole('button', { name: 'Create preview link' });
  expect(calls[0]).toMatchObject({ url: '/api/v1/layouts', method: 'POST', body: { name: 'New client drawer', customerId: 7 } });
});
