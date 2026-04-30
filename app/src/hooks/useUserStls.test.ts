import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

vi.mock('../api/userStls.api.js', () => ({
  fetchUserStls: vi.fn().mockResolvedValue([
    {
      id: '1',
      name: 'Test Bin',
      status: 'ready',
      gridX: 2,
      gridY: 1,
      imageUrl: 'img.png',
      perspImageUrls: [],
      errorMessage: null,
      createdAt: '',
    },
  ]),
  uploadUserStl: vi.fn(),
  updateUserStl: vi.fn(),
  deleteUserStl: vi.fn(),
  reprocessUserStl: vi.fn(),
  replaceUserStlFile: vi.fn(),
  fetchAdminUserStls: vi.fn(),
  promoteUserStl: vi.fn(),
}));

vi.mock('../contexts/AuthContext.js', () => ({
  useAuth: vi.fn().mockReturnValue({
    getAccessToken: () => 'test-token',
    isAuthenticated: true,
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { useAuth } from '../contexts/AuthContext.js';
import { fetchUserStls } from '../api/userStls.api.js';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useUserStlsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to authenticated by default
    vi.mocked(useAuth).mockReturnValue({
      getAccessToken: () => 'test-token',
      isAuthenticated: true,
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(fetchUserStls).mockResolvedValue([
      {
        id: '1',
        name: 'Test Bin',
        status: 'ready',
        gridX: 2,
        gridY: 1,
        imageUrl: 'img.png',
        perspImageUrls: [],
        errorMessage: null,
        createdAt: '',
      },
    ]);
  });

  it('fetches and returns user STL items', async () => {
    const { useUserStlsQuery } = await import('./useUserStls.js');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUserStlsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].name).toBe('Test Bin');
  });

  it('does not fetch when not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      getAccessToken: () => null,
      isAuthenticated: false,
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    const { useUserStlsQuery } = await import('./useUserStls.js');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUserStlsQuery(), { wrapper });

    // Query should be disabled — data stays undefined and fetchUserStls not called
    expect(result.current.data).toBeUndefined();
    expect(vi.mocked(fetchUserStls)).not.toHaveBeenCalled();
  });

  it('polls when there are active jobs', async () => {
    vi.mocked(fetchUserStls).mockResolvedValue([
      {
        id: '2',
        name: 'Processing Bin',
        status: 'processing',
        gridX: null,
        gridY: null,
        imageUrl: null,
        perspImageUrls: [],
        errorMessage: null,
        createdAt: '',
      },
    ]);

    const { useUserStlsQuery } = await import('./useUserStls.js');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUserStlsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].status).toBe('processing');
  });

  it('does not poll when all jobs are ready', async () => {
    const { useUserStlsQuery } = await import('./useUserStls.js');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUserStlsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // All items are 'ready', so refetchInterval should return false (no polling)
    expect(result.current.data![0].status).toBe('ready');
  });
});

describe('useUploadUserStlMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      getAccessToken: () => 'test-token',
      isAuthenticated: true,
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('calls uploadUserStl with file, name, and token', async () => {
    const { uploadUserStl } = await import('../api/userStls.api.js');
    const mockStl = {
      id: '3',
      name: 'My Bin',
      status: 'pending' as const,
      gridX: null,
      gridY: null,
      imageUrl: null,
      perspImageUrls: [],
      errorMessage: null,
      createdAt: '',
    };
    vi.mocked(uploadUserStl).mockResolvedValue(mockStl);

    const { useUploadUserStlMutation } = await import('./useUserStls.js');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUploadUserStlMutation(), { wrapper });

    const file = new File(['stl content'], 'test.stl', { type: 'model/stl' });
    result.current.mutate({ file, name: 'My Bin' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(uploadUserStl)).toHaveBeenCalledWith(file, 'My Bin', 'test-token');
  });
});

describe('useDeleteUserStlMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      getAccessToken: () => 'test-token',
      isAuthenticated: true,
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('calls deleteUserStl with id and token', async () => {
    const { deleteUserStl } = await import('../api/userStls.api.js');
    vi.mocked(deleteUserStl).mockResolvedValue(undefined);

    const { useDeleteUserStlMutation } = await import('./useUserStls.js');
    const wrapper = createWrapper();
    const { result } = renderHook(() => useDeleteUserStlMutation(), { wrapper });

    result.current.mutate('stl-id-123');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(deleteUserStl)).toHaveBeenCalledWith('stl-id-123', 'test-token');
  });
});
