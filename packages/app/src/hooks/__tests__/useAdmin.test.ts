import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { ApiLayout } from '@gridfinity/shared';

vi.mock('../../api/admin.api.js', () => ({
  fetchAdminUsers: vi.fn(),
  fetchAdminUserLayouts: vi.fn(),
}));

vi.mock('../../contexts/AuthContext.js', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../contexts/AuthContext.js';
import { fetchAdminUsers, fetchAdminUserLayouts } from '../../api/admin.api.js';
import { useAdminUsersQuery, useAdminUserLayoutsQuery } from '../useAdmin';

const MOCK_TOKEN = 'admin-token';

const MOCK_USERS = [
  { id: 1, username: 'alice' },
  { id: 2, username: 'bob' },
];

const MOCK_LAYOUT: ApiLayout = {
  id: 10,
  userId: 1,
  name: 'My Layout',
  description: null,
  gridX: 4,
  gridY: 4,
  widthMm: 168,
  depthMm: 168,
  spacerHorizontal: 'none',
  spacerVertical: 'none',
  isPublic: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function makeAdminAuth(overrides: Record<string, unknown> = {}) {
  return {
    getAccessToken: () => MOCK_TOKEN,
    isAuthenticated: true,
    isLoading: false,
    user: { id: 1, email: 'admin@example.com', username: 'admin', role: 'admin' as const, createdAt: '' },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useAdminUsersQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches users when authenticated as admin', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth());
    vi.mocked(fetchAdminUsers).mockResolvedValue(MOCK_USERS);

    const { result } = renderHook(() => useAdminUsersQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchAdminUsers).toHaveBeenCalledWith(MOCK_TOKEN);
    expect(result.current.data).toEqual(MOCK_USERS);
  });

  it('does not fetch when not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth({ isAuthenticated: false }));

    const { result } = renderHook(() => useAdminUsersQuery(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchAdminUsers).not.toHaveBeenCalled();
  });

  it('does not fetch when authenticated but not admin', async () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAdminAuth({ user: { id: 2, email: 'user@example.com', username: 'user', role: 'user', createdAt: '' } })
    );

    const { result } = renderHook(() => useAdminUsersQuery(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchAdminUsers).not.toHaveBeenCalled();
  });

  it('throws error when getAccessToken returns null', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth({ getAccessToken: () => null }));

    const { result } = renderHook(() => useAdminUsersQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('Not authenticated'));
  });

  it('propagates API errors', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth());
    vi.mocked(fetchAdminUsers).mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useAdminUsersQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('Server error'));
  });
});

describe('useAdminUserLayoutsQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches layouts for a given userId when authenticated as admin', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth());
    vi.mocked(fetchAdminUserLayouts).mockResolvedValue([MOCK_LAYOUT]);

    const { result } = renderHook(() => useAdminUserLayoutsQuery(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchAdminUserLayouts).toHaveBeenCalledWith(MOCK_TOKEN, 1);
    expect(result.current.data).toEqual([MOCK_LAYOUT]);
  });

  it('does not fetch when userId is null', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth());

    const { result } = renderHook(() => useAdminUserLayoutsQuery(null), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchAdminUserLayouts).not.toHaveBeenCalled();
  });

  it('does not fetch when not admin', async () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAdminAuth({ user: { id: 2, email: 'user@example.com', username: 'user', role: 'user', createdAt: '' } })
    );

    const { result } = renderHook(() => useAdminUserLayoutsQuery(5), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchAdminUserLayouts).not.toHaveBeenCalled();
  });

  it('throws when getAccessToken returns null', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth({ getAccessToken: () => null }));

    const { result } = renderHook(() => useAdminUserLayoutsQuery(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('Not authenticated'));
  });

  it('propagates API errors', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth());
    vi.mocked(fetchAdminUserLayouts).mockRejectedValue(new Error('Forbidden'));

    const { result } = renderHook(() => useAdminUserLayoutsQuery(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('Forbidden'));
  });
});
