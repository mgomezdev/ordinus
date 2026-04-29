import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { ApiLayout } from '@gridfinity/shared';

// Mock fetch globally (useAdminLayouts uses fetch internally)
vi.mock('../../contexts/AuthContext.js', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../contexts/AuthContext.js';
import { useAdminLayoutsQuery } from '../useAdminLayouts';

const MOCK_TOKEN = 'admin-token';

const MOCK_LAYOUT: ApiLayout = {
  id: 5,
  userId: 1,
  name: 'Admin Layout',
  description: null,
  gridX: 3,
  gridY: 3,
  widthMm: 126,
  depthMm: 126,
  spacerHorizontal: 'none',
  spacerVertical: 'none',
  isPublic: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  thumbnailUrl: null,
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

describe('useAdminLayoutsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('fetches all layouts when authenticated as admin', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth());

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [MOCK_LAYOUT] }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAdminLayoutsQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([MOCK_LAYOUT]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/layouts'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${MOCK_TOKEN}` }),
      })
    );
  });

  it('does not fetch when not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth({ isAuthenticated: false }));
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAdminLayoutsQuery(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fetch when authenticated but not admin role', async () => {
    vi.mocked(useAuth).mockReturnValue(
      makeAdminAuth({ user: { id: 2, email: 'u@e.com', username: 'user', role: 'user', createdAt: '' } })
    );
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAdminLayoutsQuery(), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws error when getAccessToken returns null', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth({ getAccessToken: () => null }));
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAdminLayoutsQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('Not authenticated'));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws error when fetch response is not ok', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth());

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Forbidden' } }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAdminLayoutsQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toMatchObject({ message: 'Forbidden' });
  });

  it('returns empty array when no layouts exist', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAdminAuth());

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useAdminLayoutsQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});
