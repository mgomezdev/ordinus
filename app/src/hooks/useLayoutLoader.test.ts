import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutLoader } from './useLayoutLoader';

vi.mock('../api/layouts.api.js', () => ({
  fetchLayout: vi.fn(),
}));

import { fetchLayout } from '../api/layouts.api.js';

const MOCK_DETAIL = {
  id: 42,
  name: 'My Layout',
  description: 'desc',
  status: 'draft' as const,
  widthMm: 168,
  depthMm: 126,
  spacerHorizontal: 'none',
  spacerVertical: 'none',
  placedItems: [
    {
      libraryId: 'lib1', itemId: 'bin-2x3', x: 0, y: 0,
      width: 2, height: 3, rotation: 0, customization: null,
    },
  ],
  refImagePlacements: [
    {
      refImageId: 7, name: 'ref.png', imageUrl: 'ref-lib/abc.webp',
      x: 10, y: 20, width: 25, height: 25,
      opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
    },
  ],
};

function makeParams(overrides = {}) {
  return {
    unitSystem: 'metric' as const,
    setWidth: vi.fn(),
    setDepth: vi.fn(),
    setSpacerConfig: vi.fn(),
    loadItems: vi.fn(),
    loadRefImagePlacements: vi.fn(),
    layoutDispatch: vi.fn(),
    ...overrides,
  };
}

describe('handleLoadLayout', () => {
  it('sets metric dimensions directly', () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 1, layoutName: 'Test', layoutDescription: 'desc', layoutStatus: 'draft',
        widthMm: 168, depthMm: 126,
        spacerConfig: { horizontal: 'none', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
      });
    });

    expect(params.setWidth).toHaveBeenCalledWith(168);
    expect(params.setDepth).toHaveBeenCalledWith(126);
  });

  it('converts mm to inches in imperial mode', () => {
    const params = makeParams({ unitSystem: 'imperial' as const });
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 1, layoutName: 'Test', layoutDescription: '', layoutStatus: 'draft',
        widthMm: 25.4, depthMm: 50.8,
        spacerConfig: { horizontal: 'none', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
      });
    });

    // 25.4mm = 1.0in, 50.8mm = 2.0in
    expect(params.setWidth).toHaveBeenCalledWith(1);
    expect(params.setDepth).toHaveBeenCalledWith(2);
  });

  it('builds owner string with username only', () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 5, layoutName: 'L', layoutDescription: '', layoutStatus: 'submitted',
        widthMm: 168, depthMm: 168,
        spacerConfig: { horizontal: 'none', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
        ownerUsername: 'alice',
      });
    });

    expect(params.layoutDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ owner: 'alice' }) })
    );
  });

  it('dispatches LOAD_LAYOUT with correct payload', () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 99, layoutName: 'My Layout', layoutDescription: 'cool', layoutStatus: 'draft',
        widthMm: 168, depthMm: 168,
        spacerConfig: { horizontal: 'left', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
      });
    });

    expect(params.layoutDispatch).toHaveBeenCalledWith({
      type: 'LOAD_LAYOUT',
      payload: { id: 99, name: 'My Layout', description: 'cool', owner: '' },
    });
    expect(params.setSpacerConfig).toHaveBeenCalledWith({ horizontal: 'left', vertical: 'none' });
  });
});

describe('loadLayout', () => {
  beforeEach(() => {
    vi.mocked(fetchLayout).mockResolvedValue(MOCK_DETAIL as never);
  });

  it('calls fetchLayout with id', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    await act(async () => {
      await result.current.loadLayout(42);
    });

    expect(fetchLayout).toHaveBeenCalledWith(42);
  });

  it('maps placed items with prefixed instanceId', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    await act(async () => {
      await result.current.loadLayout(42);
    });

    expect(params.loadItems).toHaveBeenCalledWith([
      expect.objectContaining({
        instanceId: expect.stringMatching(/^loaded-\d+-0$/),
        itemId: 'lib1:bin-2x3',
        x: 0, y: 0, width: 2, height: 3, rotation: 0,
      }),
    ]);
  });

  it('maps ref image placements with prefixed id', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    await act(async () => {
      await result.current.loadLayout(42);
    });

    expect(params.loadRefImagePlacements).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.stringMatching(/^loaded-ref-\d+-0$/),
        refImageId: 7,
        name: 'ref.png',
      }),
    ]);
  });
});
