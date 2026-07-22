import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { DataSourceAdapter } from '../../api/adapters/types';

vi.mock('../../contexts/DataSourceContext.js', () => ({
  useDataSource: vi.fn(),
}));

import { useDataSource } from '../../contexts/DataSourceContext.js';
import { useLibraries } from '../useLibraries';

const MOCK_LIBRARY_INFOS = [
  { id: 'gridfinity-bins', name: 'Gridfinity Bins', itemCount: 42 },
  { id: 'labeled', name: 'Labeled', itemCount: 10 },
];

function makeAdapter(overrides: Partial<DataSourceAdapter> = {}): DataSourceAdapter {
  return {
    getLibraries: vi.fn().mockResolvedValue(MOCK_LIBRARY_INFOS),
    getLibraryItems: vi.fn(),
    getLibraryMeta: vi.fn(),
    resolveImageUrl: vi.fn(),
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

describe('useLibraries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns available libraries mapped from adapter data', async () => {
    const adapter = makeAdapter();
    vi.mocked(useDataSource).mockReturnValue(adapter);

    const { result } = renderHook(() => useLibraries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.availableLibraries).toEqual([
      { id: 'gridfinity-bins', name: 'Gridfinity Bins', path: '', isEnabled: true, itemCount: 42 },
      { id: 'labeled', name: 'Labeled', path: '', isEnabled: true, itemCount: 10 },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('sets isEnabled to true for all libraries regardless of source', async () => {
    const adapter = makeAdapter({
      getLibraries: vi.fn().mockResolvedValue([
        { id: 'lib1', name: 'Library One', itemCount: 5 },
      ]),
    });
    vi.mocked(useDataSource).mockReturnValue(adapter);

    const { result } = renderHook(() => useLibraries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.availableLibraries[0].isEnabled).toBe(true);
  });

  it('returns empty array when adapter returns no libraries', async () => {
    const adapter = makeAdapter({ getLibraries: vi.fn().mockResolvedValue([]) });
    vi.mocked(useDataSource).mockReturnValue(adapter);

    const { result } = renderHook(() => useLibraries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.availableLibraries).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('exposes error when adapter getLibraries rejects', async () => {
    const adapter = makeAdapter({
      getLibraries: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    vi.mocked(useDataSource).mockReturnValue(adapter);

    const { result } = renderHook(() => useLibraries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.availableLibraries).toEqual([]);
  });

  it('is initially loading while query is in flight', () => {
    const adapter = makeAdapter({
      getLibraries: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    });
    vi.mocked(useDataSource).mockReturnValue(adapter);

    const { result } = renderHook(() => useLibraries(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('refreshLibraries invalidates the libraries query', async () => {
    const getLibraries = vi.fn()
      .mockResolvedValueOnce(MOCK_LIBRARY_INFOS)
      .mockResolvedValueOnce([...MOCK_LIBRARY_INFOS, { id: 'new', name: 'New', itemCount: 1 }]);
    const adapter = makeAdapter({ getLibraries });
    vi.mocked(useDataSource).mockReturnValue(adapter);

    const { result } = renderHook(() => useLibraries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getLibraries).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refreshLibraries();
    });

    await waitFor(() => expect(getLibraries).toHaveBeenCalledTimes(2));
    expect(result.current.availableLibraries).toHaveLength(3);
  });
});
