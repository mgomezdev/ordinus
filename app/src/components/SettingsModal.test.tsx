import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';
import { SettingsProvider } from '../contexts/SettingsContext';

const saved = { themis_url: 'http://themis:8000', themis_api_key: 'secret', laminus_url: '' };
let patchOk: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  patchOk = true;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/settings/health')) {
      return new Response(JSON.stringify({ themis: 'up', laminus: 'unconfigured' }));
    }
    if (init?.method === 'PATCH') return new Response(null, { status: patchOk ? 204 : 500 });
    return new Response(JSON.stringify(saved));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderModal(onClose = vi.fn()) {
  // The modal seeds its fields from settings on mount, so open it once they've loaded.
  const { rerender } = render(<SettingsProvider><div /></SettingsProvider>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/settings', { credentials: 'include' }));
  await new Promise(r => setTimeout(r, 0));
  rerender(<SettingsProvider><SettingsModal onClose={onClose} /></SettingsProvider>);
  return onClose;
}

describe('SettingsModal', () => {
  it('shows service health', async () => {
    await renderModal();
    expect(await screen.findByText('Up')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('saves edited settings and closes', async () => {
    const onClose = await renderModal();
    fireEvent.change(screen.getByLabelText('Laminus URL'), { target: { value: 'http://laminus:5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toMatchObject({ laminus_url: 'http://laminus:5000' });
  });

  it('shows the error and stays open when saving fails', async () => {
    patchOk = false;
    const onClose = await renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save settings')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on cancel and on overlay click, not on dialog click', async () => {
    const onClose = await renderModal();
    fireEvent.click(screen.getByText('Service Settings'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
