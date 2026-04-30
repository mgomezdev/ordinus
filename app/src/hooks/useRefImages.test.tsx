import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ApiRefImage } from '@gridfinity/shared';
import {
  useRefImagesQuery,
  useUploadRefImageMutation,
  useUploadGlobalRefImageMutation,
  useRenameRefImageMutation,
  useDeleteRefImageMutation,
} from './useRefImages';

vi.mock('../api/refImages.api', () => ({
  fetchRefImages: vi.fn(),
  uploadRefImage: vi.fn(),
  uploadGlobalRefImage: vi.fn(),
  renameRefImage: vi.fn(),
  deleteRefImage: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';
import {
  fetchRefImages,
  uploadRefImage,
  uploadGlobalRefImage,
  renameRefImage,
  deleteRefImage,
} from '../api/refImages.api';

const mockRefImage: ApiRefImage = {
  id: 1,
  ownerId: 1,
  name: 'test.png',
  isGlobal: false,
  imageUrl: 'ref-lib/test.webp',
  fileSize: 2048,
  createdAt: '2024-01-01T00:00:00.000Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useRefImagesQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch when not authenticated (enabled: false)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => null),
    });

    const { result } = renderHook(() => useRefImagesQuery(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
    expect(fetchRefImages).not.toHaveBeenCalled();
  });

  it('fetches ref images when authenticated', async () => {
    const mockImages = [mockRefImage];
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(fetchRefImages).mockResolvedValue(mockImages);

    const { result } = renderHook(() => useRefImagesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchRefImages).toHaveBeenCalledWith('mock-token');
    expect(result.current.data).toEqual(mockImages);
  });

  it('throws when getAccessToken returns null', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => null),
    });

    const { result } = renderHook(() => useRefImagesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Not authenticated'));
  });
});

describe('useUploadRefImageMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a personal ref image with token', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(uploadRefImage).mockResolvedValue(mockRefImage);

    const { result } = renderHook(() => useUploadRefImageMutation(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(['content'], 'test.png', { type: 'image/png' });

    await act(async () => {
      result.current.mutate(mockFile);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(uploadRefImage).toHaveBeenCalledWith('mock-token', mockFile);
    expect(result.current.data).toEqual(mockRefImage);
  });

  it('throws when not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => null),
    });

    const { result } = renderHook(() => useUploadRefImageMutation(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(['content'], 'test.png', { type: 'image/png' });

    await act(async () => {
      result.current.mutate(mockFile);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(new Error('Not authenticated'));
  });

  it('invalidates ref-images query on success', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(uploadRefImage).mockResolvedValue(mockRefImage);
    vi.mocked(fetchRefImages).mockResolvedValue([mockRefImage]);

    const wrapper = createWrapper();
    const { result: queryResult } = renderHook(() => useRefImagesQuery(), { wrapper });
    const { result: mutationResult } = renderHook(() => useUploadRefImageMutation(), { wrapper });

    // Wait for initial query to complete
    await waitFor(() => {
      expect(queryResult.current.isSuccess).toBe(true);
    });

    const mockFile = new File(['content'], 'test.png', { type: 'image/png' });

    await act(async () => {
      mutationResult.current.mutate(mockFile);
    });

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true);
    });

    // Query should be invalidated and refetch
    await waitFor(() => {
      expect(fetchRefImages).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useUploadGlobalRefImageMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a global ref image with token', async () => {
    const globalRefImage = { ...mockRefImage, isGlobal: true };
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(uploadGlobalRefImage).mockResolvedValue(globalRefImage);

    const { result } = renderHook(() => useUploadGlobalRefImageMutation(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(['content'], 'global.png', { type: 'image/png' });

    await act(async () => {
      result.current.mutate(mockFile);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(uploadGlobalRefImage).toHaveBeenCalledWith('mock-token', mockFile);
    expect(result.current.data).toEqual(globalRefImage);
  });

  it('invalidates ref-images query on success', async () => {
    const globalRefImage = { ...mockRefImage, isGlobal: true };
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(uploadGlobalRefImage).mockResolvedValue(globalRefImage);
    vi.mocked(fetchRefImages).mockResolvedValue([globalRefImage]);

    const wrapper = createWrapper();
    const { result: queryResult } = renderHook(() => useRefImagesQuery(), { wrapper });
    const { result: mutationResult } = renderHook(() => useUploadGlobalRefImageMutation(), { wrapper });

    // Wait for initial query to complete
    await waitFor(() => {
      expect(queryResult.current.isSuccess).toBe(true);
    });

    const mockFile = new File(['content'], 'global.png', { type: 'image/png' });

    await act(async () => {
      mutationResult.current.mutate(mockFile);
    });

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true);
    });

    // Query should be invalidated and refetch
    await waitFor(() => {
      expect(fetchRefImages).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useRenameRefImageMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames a ref image with correct id and name', async () => {
    const renamedImage = { ...mockRefImage, name: 'renamed.png' };
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(renameRefImage).mockResolvedValue(renamedImage);

    const { result } = renderHook(() => useRenameRefImageMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ id: 1, name: 'renamed.png' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(renameRefImage).toHaveBeenCalledWith('mock-token', 1, 'renamed.png');
    expect(result.current.data).toEqual(renamedImage);
  });

  it('invalidates ref-images query on success', async () => {
    const renamedImage = { ...mockRefImage, name: 'renamed.png' };
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(renameRefImage).mockResolvedValue(renamedImage);
    vi.mocked(fetchRefImages).mockResolvedValue([renamedImage]);

    const wrapper = createWrapper();
    const { result: queryResult } = renderHook(() => useRefImagesQuery(), { wrapper });
    const { result: mutationResult } = renderHook(() => useRenameRefImageMutation(), { wrapper });

    // Wait for initial query to complete
    await waitFor(() => {
      expect(queryResult.current.isSuccess).toBe(true);
    });

    await act(async () => {
      mutationResult.current.mutate({ id: 1, name: 'renamed.png' });
    });

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true);
    });

    // Query should be invalidated and refetch
    await waitFor(() => {
      expect(fetchRefImages).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useDeleteRefImageMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a ref image by id', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(deleteRefImage).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteRefImageMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(1);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(deleteRefImage).toHaveBeenCalledWith('mock-token', 1);
  });

  it('invalidates ref-images query on success', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: vi.fn(() => 'mock-token'),
    });
    vi.mocked(deleteRefImage).mockResolvedValue(undefined);
    vi.mocked(fetchRefImages).mockResolvedValue([]);

    const wrapper = createWrapper();
    const { result: queryResult } = renderHook(() => useRefImagesQuery(), { wrapper });
    const { result: mutationResult } = renderHook(() => useDeleteRefImageMutation(), { wrapper });

    // Wait for initial query to complete
    await waitFor(() => {
      expect(queryResult.current.isSuccess).toBe(true);
    });

    await act(async () => {
      mutationResult.current.mutate(1);
    });

    await waitFor(() => {
      expect(mutationResult.current.isSuccess).toBe(true);
    });

    // Query should be invalidated and refetch
    await waitFor(() => {
      expect(fetchRefImages).toHaveBeenCalledTimes(2);
    });
  });
});
