import { useCallback } from 'react';
import type { useCloneLayoutMutation } from './useLayouts';

interface UseLayoutActionsParams {
  layoutId: number | null;
  cloneLayoutMutation: ReturnType<typeof useCloneLayoutMutation>;
  handleCloneComplete: (id: number, name: string) => void;
  rawHandleSaveComplete: (layoutId: number, name: string) => void;
}

export function useLayoutActions({
  layoutId,
  cloneLayoutMutation,
  handleCloneComplete,
  rawHandleSaveComplete,
}: UseLayoutActionsParams) {
  const handleSaveComplete = useCallback((id: number, name: string) => {
    rawHandleSaveComplete(id, name);
  }, [rawHandleSaveComplete]);

  const handleCloneCurrentLayout = useCallback(async () => {
    if (!layoutId) return;
    try {
      const result = await cloneLayoutMutation.mutateAsync(layoutId);
      handleCloneComplete(result.id, result.name);
    } catch {
      // Error handled by mutation
    }
  }, [layoutId, cloneLayoutMutation, handleCloneComplete]);

  return {
    handleSaveComplete,
    handleCloneCurrentLayout,
  };
}
