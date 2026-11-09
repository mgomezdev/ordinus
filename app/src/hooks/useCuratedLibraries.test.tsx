import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CuratedLibrary } from '@gridfinity/shared';
import { createTestWrapper } from '../test/testWrapper';
import { useCuratedLibraries } from './useCuratedLibraries';

afterEach(() => vi.unstubAllGlobals());
describe('curated library queries', () => {
  it('persists create/update/delete operations and refreshes the picker after each mutation', async () => {
    let libraries: CuratedLibrary[] = [];
    const fetch = vi.fn(async (_url: string, options: RequestInit = {}) => {
      if (options.method === 'POST' || options.method === 'PUT') libraries = [JSON.parse(String(options.body)) as CuratedLibrary];
      if (options.method === 'DELETE') libraries = [];
      return { ok: true, status: options.method === 'DELETE' ? 204 : 200, json: async () => ({ data: options.method ? libraries[0] : libraries }) };
    });
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useCuratedLibraries(), { wrapper: createTestWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const library = { id: 'kitchen', name: 'Kitchen', description: '', entries: [] };
    await act(async () => { await result.current.save.mutateAsync({ library, existing: false }); });
    await waitFor(() => expect(result.current.libraries).toEqual([library]));
    await act(async () => { await result.current.save.mutateAsync({ library: { ...library, name: 'Cutlery' }, existing: true }); });
    await waitFor(() => expect(result.current.libraries[0].name).toBe('Cutlery'));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/curated-libraries/kitchen'), expect.objectContaining({ method: 'PUT' }));
    await act(async () => { await result.current.remove.mutateAsync(library.id); });
    await waitFor(() => expect(result.current.libraries).toEqual([]));
  });
});
