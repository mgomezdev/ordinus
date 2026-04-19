import { useCallback, useRef } from 'react';
import type { DialogAction } from '../reducers/dialogReducer';
import type { useCloneLayoutMutation } from './useLayouts';

interface UseLayoutActionsParams {
  layoutId: number | null;
  cloneLayoutMutation: ReturnType<typeof useCloneLayoutMutation>;
  handleCloneComplete: (id: number, name: string) => void;
  rawHandleSaveComplete: (layoutId: number, name: string) => void;
  dialogDispatch: React.Dispatch<DialogAction>;
}

export function useLayoutActions({
  layoutId,
  cloneLayoutMutation,
  handleCloneComplete,
  rawHandleSaveComplete,
  dialogDispatch,
}: UseLayoutActionsParams) {
  const submitAfterSaveRef = useRef(false);

  const handleSubmitClick = useCallback(() => {
    if (!layoutId) {
      submitAfterSaveRef.current = true;
      dialogDispatch({ type: 'OPEN', dialog: 'save' });
    }
  }, [layoutId, dialogDispatch]);

  const handleSaveComplete = useCallback((id: number, name: string) => {
    rawHandleSaveComplete(id, name);
    submitAfterSaveRef.current = false;
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
    handleSubmitClick,
    handleSaveComplete,
    handleCloneCurrentLayout,
  };
}
