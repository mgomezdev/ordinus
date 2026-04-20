import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../api/auth.api', () => ({
  loginApi: vi.fn(),
  registerApi: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn(),
  getMeApi: vi.fn(),
}));

import { refreshTokenApi, getMeApi } from '../api/auth.api';

const mockedRefreshTokenApi = vi.mocked(refreshTokenApi);
const mockedGetMeApi = vi.mocked(getMeApi);

function TestConsumer() {
  const { user, isAuthenticated, isLoading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="username">{user?.username ?? 'none'}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
    </div>
  );
}

describe('AuthContext silent refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('restores full user profile on page refresh', async () => {
    localStorage.setItem('gridfinity_refresh_token', 'valid-refresh-token');

    mockedRefreshTokenApi.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    mockedGetMeApi.mockResolvedValue({
      id: 1,
      email: 'alice@example.com',
      username: 'alice',
      role: 'user',
      createdAt: '2025-01-01T00:00:00Z',
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('username').textContent).toBe('alice');
    expect(screen.getByTestId('email').textContent).toBe('alice@example.com');
    expect(mockedGetMeApi).toHaveBeenCalledWith('new-access-token');
  });

  it('clears auth when refresh token is invalid', async () => {
    localStorage.setItem('gridfinity_refresh_token', 'expired-token');

    mockedRefreshTokenApi.mockRejectedValue(new Error('Token expired'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(localStorage.getItem('gridfinity_refresh_token')).toBeNull();
  });

  it('shows loading while refresh is in progress', () => {
    localStorage.setItem('gridfinity_refresh_token', 'some-token');

    // Never-resolving promise to keep loading state active
    mockedRefreshTokenApi.mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });

  it('calls refreshTokenApi only once even if effect re-runs (StrictMode)', async () => {
    localStorage.setItem('gridfinity_refresh_token', 'valid-refresh-token');

    mockedRefreshTokenApi.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    mockedGetMeApi.mockResolvedValue({
      id: 1,
      email: 'alice@example.com',
      username: 'alice',
      role: 'user',
      createdAt: '2025-01-01T00:00:00Z',
    });

    const { unmount } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Unmount and remount — simulates StrictMode double-invocation
    unmount();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // refreshTokenApi should have been called exactly twice (once per mount),
    // not four times (which would happen without the guard)
    expect(mockedRefreshTokenApi).toHaveBeenCalledTimes(2);
  });
});
