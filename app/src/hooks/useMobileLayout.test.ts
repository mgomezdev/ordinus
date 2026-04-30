import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMobileLayout } from './useMobileLayout';
import { STORAGE_KEYS } from '../utils/storageKeys';

let mockMatches = false;

beforeEach(() => {
  localStorage.clear();
  mockMatches = false;
  Object.defineProperty(window, 'innerWidth', {
    value: 1280,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: mockMatches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('useMobileLayout', () => {
  it('isMobile is false at desktop width (matchMedia returns false, innerWidth 1280)', () => {
    mockMatches = false;
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true });
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.isMobile).toBe(false);
  });

  it('isMobile is true at tablet width (matchMedia returns true, innerWidth 768)', () => {
    mockMatches = true;
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true, configurable: true });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.isMobile).toBe(true);
  });

  it('panels start closed by default when localStorage is empty', () => {
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.libraryOpen).toBe(false);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('toggleLibrary opens library and closes settings (mutual exclusion)', () => {
    const { result } = renderHook(() => useMobileLayout());
    act(() => { result.current.toggleSettings(); });
    expect(result.current.settingsOpen).toBe(true);
    act(() => { result.current.toggleLibrary(); });
    expect(result.current.libraryOpen).toBe(true);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('toggleSettings opens settings and closes library (mutual exclusion)', () => {
    const { result } = renderHook(() => useMobileLayout());
    act(() => { result.current.toggleLibrary(); });
    expect(result.current.libraryOpen).toBe(true);
    act(() => { result.current.toggleSettings(); });
    expect(result.current.settingsOpen).toBe(true);
    expect(result.current.libraryOpen).toBe(false);
  });

  it('closeLibrary closes only library, leaves settingsOpen unchanged', () => {
    const { result } = renderHook(() => useMobileLayout());
    act(() => { result.current.toggleLibrary(); });
    expect(result.current.libraryOpen).toBe(true);
    act(() => { result.current.closeLibrary(); });
    expect(result.current.libraryOpen).toBe(false);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('state persists to localStorage when toggleLibrary is called', () => {
    const { result } = renderHook(() => useMobileLayout());
    act(() => { result.current.toggleLibrary(); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOBILE_LAYOUT) ?? 'null');
    expect(stored).toEqual({ libraryOpen: true, settingsOpen: false });
  });

  it('loads persisted state from localStorage on mount', () => {
    localStorage.setItem(
      STORAGE_KEYS.MOBILE_LAYOUT,
      JSON.stringify({ libraryOpen: true, settingsOpen: false }),
    );
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.libraryOpen).toBe(true);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('handles corrupt localStorage gracefully — defaults to both closed', () => {
    localStorage.setItem(STORAGE_KEYS.MOBILE_LAYOUT, 'not-valid-json{{{');
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.libraryOpen).toBe(false);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('closeSettings is a no-op when settings is already closed', () => {
    const { result } = renderHook(() => useMobileLayout());
    act(() => { result.current.closeSettings(); });
    expect(result.current.settingsOpen).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.MOBILE_LAYOUT)).toBeNull();
  });
});
