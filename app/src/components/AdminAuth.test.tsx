import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminAuth } from './AdminAuth';

describe('admin entry', () => {
  it('does not mount private providers before login and opens them after real credentials succeed', async () => {
    let loggedIn = false;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') loggedIn = true;
      return new Response(JSON.stringify(loggedIn ? { username: 'admin' } : { error: { message: 'Sign in' } }), { status: loggedIn ? 200 : 401 });
    }));
    const privateMount = vi.fn();
    function Private() { privateMount(); return <p>Private workspace</p>; }
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminAuth><Private /></AdminAuth></QueryClientProvider>);
    await screen.findByRole('heading', { name: 'Sign in to Ordinus' });
    expect(privateMount).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'admin-password-123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    await screen.findByText('Private workspace');
    expect(privateMount).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('explains reset delivery and requires matching passwords', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => new Response(JSON.stringify(options?.method === 'POST' ? { requestId: 'test-request' } : {}), { status: options?.method === 'POST' ? 202 : 401 })));
    render(<QueryClientProvider client={new QueryClient()}><AdminAuth><p>Private</p></AdminAuth></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset admin password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request reset code' }));
    await screen.findByLabelText('Reset code');
    expect(screen.getByText(/test-request/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reset code'), { target: { value: 'code' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'admin-password-123!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password', exact: true }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Passwords do not match'));
    vi.unstubAllGlobals();
  });
  it('preserves reset inputs across session polling and returning from the server logs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/session')) await new Promise(resolve => setTimeout(resolve, 50));
      return new Response(JSON.stringify(url.endsWith('/reset/request') ? { requestId: 'keep-this-request' } : {}), { status: url.endsWith('/reset/request') ? 202 : 401 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><AdminAuth><p>Private</p></AdminAuth></QueryClientProvider>);
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Reset admin password' }));
      fireEvent.click(screen.getByRole('button', { name: 'Request reset code' }));
      fireEvent.change(await screen.findByLabelText('Reset code'), { target: { value: 'copied-code' } });
      fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'eight123' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
        focusManager.setFocused(false);
        focusManager.setFocused(true);
        await vi.advanceTimersByTimeAsync(100);
      });
      expect((screen.getByLabelText('Reset code') as HTMLInputElement).value).toBe('copied-code');
      expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('eight123');
      expect(screen.getByText('keep-this-request')).toBeTruthy();
      expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/session'))).toHaveLength(1);
      expect(screen.getByLabelText('New password').getAttribute('minlength')).toBe('8');
      expect(screen.getByLabelText('Confirm password').getAttribute('minlength')).toBe('8');
    } finally {
      view.unmount(); client.clear(); focusManager.setFocused(undefined);
      vi.useRealTimers(); vi.unstubAllGlobals();
    }
  });
});
