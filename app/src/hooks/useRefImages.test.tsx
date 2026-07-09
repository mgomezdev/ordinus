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
      queries: { retry: false },
      mutations: { retry: false },
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

  it('fetches ref images', async () => {
    const mockImages = [mockRefImage];
    vi.mocked(fetchRefImages).mockResolvedValue(mockImages);

    const { result } = renderHook(() => useRefImagesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchRefImages).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockImages);
  });

  it('returns empty array initially', () => {
    vi.mocked(fetchRefImages).mockResolvedValue([]);

    const { result } = renderHook(() => useRefImagesQuery(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
  });
});

describe('useUploadRefImageMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a personal ref image', async () => {
    vi.mocked(uploadRefImage).mockResolvedValue(mockRefImage);

    const { result } = renderHook(() => useUploadRefImageMutation(), {
      wrapper: createWrapper(),
    });

    const file = new File(['content'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(uploadRefImage).toHaveBeenCalledWith(file);
  });
});

describe('useUploadGlobalRefImageMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a global ref image', async () => {
    vi.mocked(uploadGlobalRefImage).mockResolvedValue({ ...mockRefImage, isGlobal: true });

    const { result } = renderHook(() => useUploadGlobalRefImageMutation(), {
      wrapper: createWrapper(),
    });

    const file = new File(['content'], 'global.png', { type: 'image/png' });

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(uploadGlobalRefImage).toHaveBeenCalledWith(file);
  });
});

describe('useRenameRefImageMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames a ref image', async () => {
    const renamedImage = { ...mockRefImage, name: 'renamed.png' };
    vi.mocked(renameRefImage).mockResolvedValue(renamedImage);

    const { result } = renderHook(() => useRenameRefImageMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 1, name: 'renamed.png' });
    });

    expect(renameRefImage).toHaveBeenCalledWith(1, 'renamed.png');
  });
});

describe('useDeleteRefImageMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a ref image', async () => {
    vi.mocked(deleteRefImage).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteRefImageMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(deleteRefImage).toHaveBeenCalledWith(1);
  });
});
