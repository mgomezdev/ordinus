import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { LibraryItem, PlacedItem } from '../types/gridfinity';

vi.mock('../api/generation.api', () => ({
  requestCustomGenerationApi: vi.fn(),
}));

import { requestCustomGenerationApi } from '../api/generation.api';
import { useCustomBins, customItemId } from './useCustomBins';

const spec = { width: 2.5, depth: 1.5, height: 3.5, overrides: {} };
const libraryItem: LibraryItem = { id: 'bins_standard:bin-1x1', libraryId: 'bins_standard', name: '1x1', widthUnits: 1, heightUnits: 1, color: '#000', categories: [] };
const getItemById = (id: string) => (id === libraryItem.id ? libraryItem : undefined);

beforeEach(() => {
  vi.mocked(requestCustomGenerationApi).mockReset();
  vi.mocked(requestCustomGenerationApi).mockResolvedValue({ hash: 'a'.repeat(64), status: 'pending' });
});

describe('customItemId', () => {
  it('prefixes the first 12 hash characters', () => {
    expect(customItemId('0123456789abcdef')).toBe('custom:custom-0123456789ab');
  });
});

describe('useCustomBins', () => {
  it('registers a custom bin as a synthetic library item', async () => {
    const { result } = renderHook(() => useCustomBins(getItemById, []));
    let created: Awaited<ReturnType<typeof result.current.createCustomItem>> | undefined;
    await act(async () => { created = await result.current.createCustomItem(spec); });
    const item = created!.item;
    expect(created!.status).toBe('pending');

    expect(item).toMatchObject({
      id: customItemId('a'.repeat(64)), libraryId: 'custom', name: 'Custom 2.5×1.5×3.5',
      widthUnits: 2.5, heightUnits: 1.5, paramHash: 'a'.repeat(64), customSpec: spec,
    });
    expect(result.current.resolveItem(item.id)).toBe(item);
    expect(result.current.customItems).toEqual([item]);
  });

  it('falls through to library items for other ids', () => {
    const { result } = renderHook(() => useCustomBins(getItemById, []));
    expect(result.current.resolveItem(libraryItem.id)).toBe(libraryItem);
    expect(result.current.resolveItem('nope')).toBeUndefined();
  });

  it('resolves specs of loaded placed items under their saved id', async () => {
    const placed: PlacedItem[] = [{
      instanceId: 'p', itemId: 'custom:custom-saved', x: 0, y: 0, width: 2.5, height: 1.5, rotation: 0, customSpec: spec,
    }];
    const { result } = renderHook(() => useCustomBins(getItemById, placed));
    await waitFor(() => expect(result.current.resolveItem('custom:custom-saved')).toBeDefined());
    expect(result.current.resolveItem('custom:custom-saved')).toMatchObject({ paramHash: 'a'.repeat(64), customSpec: spec });
    expect(requestCustomGenerationApi).toHaveBeenCalledTimes(1);
  });

  it('asks the server only once for the same loaded id', async () => {
    const placed: PlacedItem[] = ['p1', 'p2'].map(instanceId => ({
      instanceId, itemId: 'custom:custom-saved', x: 0, y: 0, width: 2.5, height: 1.5, rotation: 0, customSpec: spec,
    }));
    const { result, rerender } = renderHook(() => useCustomBins(getItemById, placed));
    await waitFor(() => expect(result.current.resolveItem('custom:custom-saved')).toBeDefined());
    rerender();
    expect(requestCustomGenerationApi).toHaveBeenCalledTimes(1);
  });
});
