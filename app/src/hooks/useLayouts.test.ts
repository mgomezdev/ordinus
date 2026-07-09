import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';

vi.mock('../api/layouts.api.js', () => ({
  fetchLayouts: vi.fn(),
  fetchLayout: vi.fn(),
  createLayout: vi.fn(),
  updateLayout: vi.fn(),
  updateLayoutMeta: vi.fn(),
  deleteLayoutApi: vi.fn(),
  cloneLayout: vi.fn(),
}));

import {
  fetchLayouts, createLayout, updateLayout, deleteLayoutApi, cloneLayout,
} from '../api/layouts.api.js';
import {
  useLayoutsQuery, useSaveLayoutMutation, useUpdateLayoutMutation,
  useDeleteLayoutMutation, useCloneLayoutMutation,
} from './useLayouts';

const MOCK_LAYOUT = {
  id: 1, name: 'Test', status: 'draft',
  gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
  spacerHorizontal: 'none', spacerVertical: 'none',
  updatedAt: '', createdAt: '',
};
const MOCK_PAYLOAD = {
  name: 'Test', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
  spacerHorizontal: 'none' as const, spacerVertical: 'none' as const, placedItems: [],
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useLayoutsQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches layouts', async () => {
    vi.mocked(fetchLayouts).mockResolvedValue({ data: [MOCK_LAYOUT] } as never);

    const { result } = renderHook(() => useLayoutsQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([MOCK_LAYOUT]);
    expect(fetchLayouts).toHaveBeenCalled();
  });
});

describe('useSaveLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls createLayout with data', async () => {
    vi.mocked(createLayout).mockResolvedValue({ id: 99, ...MOCK_PAYLOAD, status: 'draft' } as never);

    const { result } = renderHook(() => useSaveLayoutMutation(), { wrapper: createWrapper() });
    await act(async () => { await result.current.mutateAsync(MOCK_PAYLOAD); });
    expect(createLayout).toHaveBeenCalledWith(MOCK_PAYLOAD);
  });
});

describe('useUpdateLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updateLayout with id and data', async () => {
    vi.mocked(updateLayout).mockResolvedValue({ ...MOCK_LAYOUT, name: 'Updated' } as never);

    const { result } = renderHook(() => useUpdateLayoutMutation(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: 1, data: { ...MOCK_PAYLOAD, name: 'Updated' } });
    });
    expect(updateLayout).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Updated' }));
  });
});

describe('useDeleteLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deleteLayoutApi with id', async () => {
    vi.mocked(deleteLayoutApi).mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useDeleteLayoutMutation(), { wrapper: createWrapper() });
    await act(async () => { await result.current.mutateAsync(5); });
    expect(deleteLayoutApi).toHaveBeenCalledWith(5);
  });
});

describe('useCloneLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls cloneLayout with id', async () => {
    vi.mocked(cloneLayout).mockResolvedValue({ id: 99, name: 'Copy of Test', status: 'draft' } as never);

    const { result } = renderHook(() => useCloneLayoutMutation(), { wrapper: createWrapper() });
    await act(async () => { await result.current.mutateAsync(1); });
    expect(cloneLayout).toHaveBeenCalledWith(1);
  });
});
