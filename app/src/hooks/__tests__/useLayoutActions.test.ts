import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutActions } from '../useLayoutActions';
import type { useCloneLayoutMutation } from '../useLayouts';

// Helper to create a minimal mock of the clone mutation
function makeCloneMutation(overrides: Partial<ReturnType<typeof useCloneLayoutMutation>> = {}): ReturnType<typeof useCloneLayoutMutation> {
  return {
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    isIdle: true,
    error: null,
    data: undefined,
    reset: vi.fn(),
    status: 'idle',
    variables: undefined,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    submittedAt: 0,
    isPaused: false,
    ...overrides,
  } as ReturnType<typeof useCloneLayoutMutation>;
}

describe('useLayoutActions', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('handleSaveComplete', () => {
    it('calls rawHandleSaveComplete with id and name', () => {
      const rawHandleSaveComplete = vi.fn();
      const handleCloneComplete = vi.fn();
      const cloneLayoutMutation = makeCloneMutation();

      const { result } = renderHook(() =>
        useLayoutActions({
          layoutId: 1,
          cloneLayoutMutation,
          handleCloneComplete,
          rawHandleSaveComplete,
        })
      );

      act(() => {
        result.current.handleSaveComplete(42, 'My Layout');
      });

      expect(rawHandleSaveComplete).toHaveBeenCalledWith(42, 'My Layout');
    });

    it('is stable across renders when rawHandleSaveComplete does not change', () => {
      const rawHandleSaveComplete = vi.fn();
      const handleCloneComplete = vi.fn();
      const cloneLayoutMutation = makeCloneMutation();

      const { result, rerender } = renderHook(() =>
        useLayoutActions({
          layoutId: 1,
          cloneLayoutMutation,
          handleCloneComplete,
          rawHandleSaveComplete,
        })
      );

      const firstRef = result.current.handleSaveComplete;
      rerender();
      expect(result.current.handleSaveComplete).toBe(firstRef);
    });
  });

  describe('handleCloneCurrentLayout', () => {
    it('calls mutateAsync with current layoutId and then calls handleCloneComplete', async () => {
      const handleCloneComplete = vi.fn();
      const rawHandleSaveComplete = vi.fn();
      const clonedLayout = { id: 99, name: 'Clone of My Layout' } as ReturnType<typeof useCloneLayoutMutation>['data'];
      const cloneLayoutMutation = makeCloneMutation({
        mutateAsync: vi.fn().mockResolvedValue(clonedLayout),
      });

      const { result } = renderHook(() =>
        useLayoutActions({
          layoutId: 5,
          cloneLayoutMutation,
          handleCloneComplete,
          rawHandleSaveComplete,
        })
      );

      await act(async () => {
        await result.current.handleCloneCurrentLayout();
      });

      expect(cloneLayoutMutation.mutateAsync).toHaveBeenCalledWith(5);
      expect(handleCloneComplete).toHaveBeenCalledWith(99, 'Clone of My Layout');
    });

    it('does not call mutateAsync when layoutId is null', async () => {
      const handleCloneComplete = vi.fn();
      const rawHandleSaveComplete = vi.fn();
      const cloneLayoutMutation = makeCloneMutation({
        mutateAsync: vi.fn(),
      });

      const { result } = renderHook(() =>
        useLayoutActions({
          layoutId: null,
          cloneLayoutMutation,
          handleCloneComplete,
          rawHandleSaveComplete,
        })
      );

      await act(async () => {
        await result.current.handleCloneCurrentLayout();
      });

      expect(cloneLayoutMutation.mutateAsync).not.toHaveBeenCalled();
      expect(handleCloneComplete).not.toHaveBeenCalled();
    });

    it('does not call handleCloneComplete when mutateAsync throws', async () => {
      const handleCloneComplete = vi.fn();
      const rawHandleSaveComplete = vi.fn();
      const cloneLayoutMutation = makeCloneMutation({
        mutateAsync: vi.fn().mockRejectedValue(new Error('Clone failed')),
      });

      const { result } = renderHook(() =>
        useLayoutActions({
          layoutId: 3,
          cloneLayoutMutation,
          handleCloneComplete,
          rawHandleSaveComplete,
        })
      );

      await act(async () => {
        // Should not throw — errors are swallowed
        await result.current.handleCloneCurrentLayout();
      });

      expect(handleCloneComplete).not.toHaveBeenCalled();
    });
  });
});
