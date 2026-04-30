import { useReducer, useCallback } from 'react';
import { layoutMetaReducer, initialLayoutMetaState } from '../reducers/layoutMetaReducer';
import type { LayoutMetaState } from '../reducers/layoutMetaReducer';

interface LoadLayoutPayload {
  id: number;
  name: string;
  description: string;
  owner: string;
}

export function useLayoutMeta() {
  const [layoutMeta, layoutDispatch] = useReducer(layoutMetaReducer, initialLayoutMetaState);

  const handleSaveComplete = useCallback((layoutId: number, name: string) => {
    layoutDispatch({ type: 'SAVE_COMPLETE', payload: { id: layoutId, name } });
  }, []);

  const handleCloneComplete = useCallback((id: number, name: string) => {
    layoutDispatch({ type: 'CLONE_COMPLETE', payload: { id, name } });
  }, []);

  const handleLoadLayout = useCallback((payload: LoadLayoutPayload) => {
    layoutDispatch({ type: 'LOAD_LAYOUT', payload });
  }, []);

  const handleClearLayout = useCallback(() => {
    layoutDispatch({ type: 'CLEAR_LAYOUT' });
  }, []);

  return {
    layoutMeta,
    layoutDispatch,
    handleSaveComplete,
    handleCloneComplete,
    handleLoadLayout,
    handleClearLayout,
  };
}

export type { LayoutMetaState };
