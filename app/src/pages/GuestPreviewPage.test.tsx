import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GuestPreviewPage } from './GuestPreviewPage';

const id = 'a'.repeat(24);
const response = { expiresAt: '2099-01-01T00:00:00.000Z', layout: {
  name: 'Kitchen drawer', gridX: 4, gridY: 3, gridResolution: 2, widthMm: 168, depthMm: 126,
  spacerHorizontal: 'none', spacerVertical: 'none', savedAt: '2026-11-09T00:00:00Z', referenceImages: [],
  bins: [{ id: 1, name: 'Utensil tray', x: 0, y: 0, width: 4, depth: 2, rotation: 0, heightUnits: 4 }],
} };
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><GuestPreviewPage linkId={id} /></QueryClientProvider>);
}
beforeEach(() => { window.history.replaceState(null, '', `/guest/${id}`); });
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
describe('guest preview entry', () => {
  it('requires an explicit invitation join, removes the secret from history, and shows a read-only drawer', async () => {
    window.history.replaceState(null, '', `/guest/${id}#invitation-secret`);
    const fetchMock = vi.fn(async (url: string) => url.endsWith('/join') ? new Response(null, { status: 204 }) : new Response(JSON.stringify(url.endsWith('/status') ? { active: true } : response), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    mount();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open preview' }));
    await screen.findByRole('heading', { name: 'Kitchen drawer' });
    expect(window.location.hash).toBe('');
    expect(screen.getByText('Read-only preview')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Drawer layout' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Select bin 1: Utensil tray/ }));
    expect(screen.getByRole('button', { name: /Bin 1: Utensil tray/ }).getAttribute('aria-pressed')).toBe('true');
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith(`/api/v1/guest/${id}/`))).toBe(true);
  });
  it('hides the drawer when the server reports closed access', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/status') ? { error: { message: 'Access closed' } } : response), { status: url.endsWith('/status') ? 410 : 200 })));
    mount();
    await screen.findByRole('heading', { name: 'Preview unavailable' });
    expect(screen.queryByRole('group', { name: 'Drawer layout' })).toBeNull();
    window.history.replaceState(null, '', `/guest/${id}#original-invitation`);
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('button', { name: 'Open preview' })).toBeTruthy();
  });
  it('opens a previously joined preview without requiring a link secret again', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/status') ? { active: true } : response))));
    mount();
    await screen.findByRole('heading', { name: 'Kitchen drawer' });
    fireEvent.click(screen.getByRole('button', { name: 'Leave preview' }));
    await screen.findByRole('heading', { name: 'You left the preview' });
    expect(screen.queryByRole('group', { name: 'Drawer layout' })).toBeNull();
    window.history.replaceState(null, '', `/guest/${id}#original-invitation`);
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('button', { name: 'Open preview' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open preview' }));
    await screen.findByRole('heading', { name: 'Kitchen drawer' });
  });
});
