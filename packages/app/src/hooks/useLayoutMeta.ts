import { useReducer, useCallback } from 'react';
import type { LayoutStatus } from '@gridfinity/shared';
import { layoutMetaReducer, initialLayoutMetaState } from '../reducers/layoutMetaReducer';
import type { LayoutMetaState } from '../reducers/layoutMetaReducer';

interface LoadLayoutPayload {
  id: number;
  name: string;
  description: string;
  status: LayoutStatus | null;
  owner: string;
}

export function useLayoutMeta() {
  const [layoutMeta, layoutDispatch] = useReducer(layoutMetaReducer, initialLayoutMetaState);

  const isReadOnly = layoutMeta.status === 'delivered';

  const handleSaveComplete = useCallback((layoutId: number, name: string, status: LayoutStatus) => {
    layoutDispatch({ type: 'SAVE_COMPLETE', payload: { id: layoutId, name, status } });
  }, []);

  const handleSetStatus = useCallback((status: LayoutStatus | null) => {
    layoutDispatch({ type: 'SET_STATUS', payload: status });
  }, []);

  const handleCloneComplete = useCallback((id: number, name: string, status: LayoutStatus) => {
    layoutDispatch({ type: 'CLONE_COMPLETE', payload: { id, name, status } });
  }, []);

  const handleLoadLayout = useCallback((payload: LoadLayoutPayload) => {
    layoutDispatch({ type: 'LOAD_LAYOUT', payload });
  }, []);

  const handleClearLayout = useCallback(() => {
    layoutDispatch({ type: 'CLEAR_LAYOUT' });
  }, []);

  const handleSetSubmissionId = useCallback((submissionId: number | null) => {
    layoutDispatch({ type: 'SET_SUBMISSION_ID', payload: submissionId });
  }, []);

  return {
    layoutMeta,
    layoutDispatch,
    isReadOnly,
    handleSaveComplete,
    handleSetStatus,
    handleCloneComplete,
    handleLoadLayout,
    handleClearLayout,
    handleSetSubmissionId,
  };
}

export type { LayoutMetaState };
