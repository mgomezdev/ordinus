import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
});
