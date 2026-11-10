import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
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
  it('loads prepared models automatically without refetching the saved layout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let modelChecks = 0;
    let layoutChecks = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/view')) layoutChecks++;
      if (url.endsWith('/models')) {
        modelChecks++;
        return new Response(JSON.stringify({ bins: [{ id: 1, topUrl: modelChecks > 1 ? `/api/v1/guest/${id}/bins/1/top` : null,
          perspectiveUrl: null, topRotation: 0, status: modelChecks > 1 ? 'ready' : 'pending' }] }));
      }
      return new Response(JSON.stringify(url.endsWith('/status') ? { active: true } : response));
    }));
    const view = mount();
    try {
      await waitFor(() => expect(modelChecks).toBe(1));
      expect(screen.getByText('Preparing bin previews. They will appear here when ready.')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
      expect(screen.getByRole('img', { name: 'Utensil tray, top view' })).toBeTruthy();
      expect(layoutChecks).toBe(1);
    } finally { view.unmount(); vi.useRealTimers(); }
  });
  it('switches scoped top and 3D renders, preserves rotation and selection, and handles a missing render', async () => {
    const topUrl = `/api/v1/guest/${id}/bins/1/top`;
    const perspectiveUrl = `/api/v1/guest/${id}/bins/1/perspective`;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/models')
      ? { bins: [{ id: 1, topUrl, perspectiveUrl, topRotation: 90, status: 'ready' }] }
      : url.endsWith('/status') ? { active: true } : response))));
    mount();
    const image = await screen.findByRole('img', { name: 'Utensil tray, top view' });
    expect(image.getAttribute('src')).toBe(topUrl);
    expect(image.getAttribute('style')).toContain('rotate(90deg)');
    fireEvent.click(screen.getByRole('button', { name: /Select bin 1:/ }));
    fireEvent.click(screen.getByRole('button', { name: '3D', exact: true }));
    const perspective = await screen.findByRole('img', { name: 'Utensil tray, 3D view' });
    expect(perspective.getAttribute('src')).toBe(perspectiveUrl);
    expect(perspective.getAttribute('style') ?? '').not.toContain('rotate');
    expect(screen.getByRole('button', { name: /Select bin 1:/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.error(perspective);
    expect(screen.queryByRole('img', { name: 'Utensil tray, 3D view' })).toBeNull();
    expect(screen.getByText('3D preview unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Top', exact: true }));
    expect(screen.getByRole('img', { name: 'Utensil tray, top view' })).toBeTruthy();
  });
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
