import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutMeta } from './useLayoutMeta';

describe('useLayoutMeta', () => {
  describe('Initial State', () => {
    it('should initialize with null id and empty strings', () => {
      const { result } = renderHook(() => useLayoutMeta());
      expect(result.current.layoutMeta).toEqual({
        id: null,
        name: '',
        description: '',
        owner: '',
      });
    });
  });

  describe('handleSaveComplete', () => {
    it('should set id and name on save', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(42, 'My Layout');
      });

      expect(result.current.layoutMeta.id).toBe(42);
      expect(result.current.layoutMeta.name).toBe('My Layout');
    });
  });

  describe('handleCloneComplete', () => {
    it('should update id and name on clone', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(1, 'Original');
      });
      act(() => {
        result.current.handleCloneComplete(99, 'Original (copy)');
      });

      expect(result.current.layoutMeta.id).toBe(99);
      expect(result.current.layoutMeta.name).toBe('Original (copy)');
    });
  });

  describe('handleLoadLayout', () => {
    it('should set all layout metadata fields', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleLoadLayout({
          id: 42,
          name: 'Loaded Layout',
          description: 'A test layout',
          owner: 'alice',
        });
      });

      expect(result.current.layoutMeta).toEqual({
        id: 42,
        name: 'Loaded Layout',
        description: 'A test layout',
        owner: 'alice',
      });
    });
  });

  describe('handleClearLayout', () => {
    it('should reset to initial state', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(42, 'To Clear');
      });
      act(() => {
        result.current.handleClearLayout();
      });

      expect(result.current.layoutMeta).toEqual({
        id: null,
        name: '',
        description: '',
        owner: '',
      });
    });
  });

  describe('layoutDispatch passthrough', () => {
    it('should expose the raw dispatch function', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.layoutDispatch({
          type: 'LOAD_LAYOUT',
          payload: { id: 7, name: 'Dispatched', description: 'test', owner: '' },
        });
      });

      expect(result.current.layoutMeta.id).toBe(7);
      expect(result.current.layoutMeta.name).toBe('Dispatched');
    });
  });
});
