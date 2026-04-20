import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageLoadState } from './useImageLoadState';

describe('useImageLoadState', () => {
  it('starts with no load, no error, no visible image', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    expect(result.current.imageLoaded).toBe(false);
    expect(result.current.imageError).toBe(false);
    expect(result.current.shouldShowImage).toBe(false);
  });

  it('handleImageLoad marks loaded true for current url', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    act(() => result.current.handleImageLoad());
    expect(result.current.imageLoaded).toBe(true);
    expect(result.current.shouldShowImage).toBe(true);
  });

  it('handleImageError marks error true and loaded false', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    act(() => result.current.handleImageError());
    expect(result.current.imageError).toBe(true);
    expect(result.current.imageLoaded).toBe(false);
    expect(result.current.shouldShowImage).toBe(false);
  });

  it('stale load state does not apply when url changes', () => {
    let url = 'http://example.com/a.png';
    const { result, rerender } = renderHook(() => useImageLoadState(url));
    act(() => result.current.handleImageLoad());
    expect(result.current.imageLoaded).toBe(true);

    url = 'http://example.com/b.png';
    rerender();
    expect(result.current.imageLoaded).toBe(false);
    expect(result.current.shouldShowImage).toBe(false);
  });

  it('stale error state does not apply when url changes', () => {
    let url = 'http://example.com/a.png';
    const { result, rerender } = renderHook(() => useImageLoadState(url));
    act(() => result.current.handleImageError());
    expect(result.current.imageError).toBe(true);

    url = 'http://example.com/b.png';
    rerender();
    expect(result.current.imageError).toBe(false);
  });

  it('shouldShowImage is false when url is undefined', () => {
    const { result } = renderHook(() => useImageLoadState(undefined));
    act(() => result.current.handleImageLoad());
    expect(result.current.shouldShowImage).toBeFalsy();
  });

  it('load after error clears the error', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    act(() => result.current.handleImageError());
    act(() => result.current.handleImageLoad());
    expect(result.current.imageError).toBe(false);
    expect(result.current.imageLoaded).toBe(true);
  });

  it('error after load clears the loaded state', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    act(() => result.current.handleImageLoad());
    act(() => result.current.handleImageError());
    expect(result.current.imageLoaded).toBe(false);
    expect(result.current.imageError).toBe(true);
  });
});
