import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GuestLinkPanel } from './GuestLinkPanel';

let writes: Array<{ method: string; body: Record<string, unknown> }>;
let librariesFail: boolean;
let closeFails: boolean;
const link = { id: 'a'.repeat(24), createdAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', revokedAt: null };
beforeEach(() => {
  writes = []; librariesFail = false; closeFails = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';
    if (method === 'GET') {
      if (url.endsWith('/libraries')) return new Response(JSON.stringify(librariesFail ? { error: { message: 'Unavailable' } } : { data: [{ id: 'bins_standard', name: 'Standard' }, { id: 'second', name: 'Second' }] }), { status: librariesFail ? 503 : 200 });
      return new Response(JSON.stringify({ data: [] }));
    }
    const body = JSON.parse(String(options?.body ?? '{}')) as Record<string, unknown>;
    writes.push({ method, body });
    if (method === 'DELETE') return closeFails ? new Response(JSON.stringify({ error: { message: 'Could not close access' } }), { status: 503 }) : new Response(null, { status: 204 });
    return new Response(JSON.stringify({ ...link, allowEdit: !!body.allowEdit, secret: 'one-time-invitation' }));
  }));
});
afterEach(() => vi.unstubAllGlobals());
function mount(beforeCreate?: () => Promise<void>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><GuestLinkPanel layoutId={42} name="Drawer" beforeCreate={beforeCreate} /></QueryClientProvider>);
  return client;
}

it('creates a read-only invitation with the selected expiry and keeps its secret out of the query cache', async () => {
  const client = mount();
  fireEvent.change(screen.getByLabelText('Link expires after'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create preview link' }));
  expect(await screen.findByLabelText('Preview link')).toHaveValue(`${window.location.origin}/guest/${link.id}#one-time-invitation`);
  expect(writes).toEqual([{ method: 'POST', body: { expiresInHours: 1 } }]);
  expect(JSON.stringify(client.getQueryData(['guest-links', 42]))).not.toContain('one-time-invitation');
  expect(screen.getByText(/Active · Read-only/)).toBeVisible();
});

it('requires available libraries and saves before creating a multi-library editing invitation', async () => {
  let release!: () => void;
  const beforeCreate = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
  mount(beforeCreate);
  fireEvent.click(screen.getByLabelText('Allow client editing (live)'));
  fireEvent.click(await screen.findByLabelText('Standard'));
  const create = screen.getByRole('button', { name: 'Create collaboration link' });
  expect(create).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Second'));
  fireEvent.click(screen.getByLabelText('Standard'));
  fireEvent.click(create);
  await waitFor(() => expect(beforeCreate).toHaveBeenCalledOnce());
  expect(writes).toHaveLength(0);
  expect(screen.getByLabelText('Allow client editing (live)')).toBeDisabled();
  release();
  await screen.findByLabelText('Preview link');
  expect(writes[0].body).toEqual({ expiresInHours: 24, allowEdit: true, libraryIds: ['second', 'bins_standard'] });
  expect(screen.getByText(/Active · Live editing/)).toBeVisible();
});

it('blocks sharing when saving fails and supports an explicit retry', async () => {
  const beforeCreate = vi.fn().mockRejectedValueOnce(new Error('Review conflicting changes')).mockResolvedValue(undefined);
  mount(beforeCreate);
  fireEvent.click(screen.getByRole('button', { name: 'Create preview link' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Review conflicting changes');
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Create preview link' }));
  await screen.findByLabelText('Preview link');
  expect(writes).toHaveLength(1);
});

it('keeps editing invitations disabled until a failed library lookup is retried successfully', async () => {
  librariesFail = true; mount();
  fireEvent.click(screen.getByLabelText('Allow client editing (live)'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load bin libraries');
  expect(screen.getByRole('button', { name: 'Create collaboration link' })).toBeDisabled();
  librariesFail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByLabelText('Standard');
  expect(screen.getByRole('button', { name: 'Create collaboration link' })).toBeEnabled();
});

it('retains access after failed revocation and clears the invitation only after successful closure', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Create preview link' }));
  await screen.findByLabelText('Preview link');
  closeFails = true;
  fireEvent.click(screen.getByRole('button', { name: 'Close access' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not close access');
  expect(screen.getByLabelText('Preview link')).toBeVisible();
  closeFails = false;
  fireEvent.click(screen.getByRole('button', { name: 'Close access' }));
  await waitFor(() => expect(screen.queryByLabelText('Preview link')).toBeNull());
  expect(screen.getByText(/Closed · Read-only/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Close access' })).toBeNull();
});
