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
        status: null,
        owner: '',
        submissionId: null,
      });
    });

    it('should report isReadOnly as false initially', () => {
      const { result } = renderHook(() => useLayoutMeta());
      expect(result.current.isReadOnly).toBe(false);
    });
  });

  describe('handleSaveComplete', () => {
    it('should set id, name, and status on save', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(42, 'My Layout', 'draft');
      });

      expect(result.current.layoutMeta.id).toBe(42);
      expect(result.current.layoutMeta.name).toBe('My Layout');
      expect(result.current.layoutMeta.status).toBe('draft');
    });
  });

  describe('handleSetStatus', () => {
    it('should update status', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(1, 'Test', 'draft');
      });
      act(() => {
        result.current.handleSetStatus('submitted');
      });

      expect(result.current.layoutMeta.status).toBe('submitted');
    });
  });

  describe('handleCloneComplete', () => {
    it('should update id, name, and status on clone', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(1, 'Original', 'delivered');
      });
      act(() => {
        result.current.handleCloneComplete(99, 'Original (copy)', 'draft');
      });

      expect(result.current.layoutMeta.id).toBe(99);
      expect(result.current.layoutMeta.name).toBe('Original (copy)');
      expect(result.current.layoutMeta.status).toBe('draft');
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
          status: 'submitted',
          owner: 'alice',
        });
      });

      expect(result.current.layoutMeta).toEqual({
        id: 42,
        name: 'Loaded Layout',
        description: 'A test layout',
        status: 'submitted',
        owner: 'alice',
        submissionId: null,
      });
    });
  });

  describe('handleClearLayout', () => {
    it('should reset to initial state', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(42, 'To Clear', 'draft');
      });
      act(() => {
        result.current.handleClearLayout();
      });

      expect(result.current.layoutMeta).toEqual({
        id: null,
        name: '',
        description: '',
        status: null,
        owner: '',
        submissionId: null,
      });
    });
  });

  describe('isReadOnly', () => {
    it('should be true when status is delivered', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleLoadLayout({
          id: 1,
          name: 'Delivered',
          description: '',
          status: 'delivered',
          owner: '',
        });
      });

      expect(result.current.isReadOnly).toBe(true);
    });

    it('should be false when status is draft', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(1, 'Draft', 'draft');
      });

      expect(result.current.isReadOnly).toBe(false);
    });

    it('should be false when status is submitted', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSaveComplete(1, 'Submitted', 'submitted');
      });

      expect(result.current.isReadOnly).toBe(false);
    });
  });

  describe('handleSetSubmissionId', () => {
    it('should set the submissionId', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSetSubmissionId(42);
      });

      expect(result.current.layoutMeta.submissionId).toBe(42);
    });

    it('should allow clearing the submissionId back to null', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.handleSetSubmissionId(7);
      });
      act(() => {
        result.current.handleSetSubmissionId(null);
      });

      expect(result.current.layoutMeta.submissionId).toBeNull();
    });
  });

  describe('layoutDispatch passthrough', () => {
    it('should expose the raw dispatch function', () => {
      const { result } = renderHook(() => useLayoutMeta());

      act(() => {
        result.current.layoutDispatch({
          type: 'LOAD_LAYOUT',
          payload: { id: 7, name: 'Dispatched', description: 'test', status: 'draft', owner: '' },
        });
      });

      expect(result.current.layoutMeta.id).toBe(7);
      expect(result.current.layoutMeta.name).toBe('Dispatched');
    });
  });
});
