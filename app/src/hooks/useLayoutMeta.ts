import { useReducer, useCallback } from 'react';
import { layoutMetaReducer, initialLayoutMetaState } from '../reducers/layoutMetaReducer';
import type { LayoutMetaState } from '../reducers/layoutMetaReducer';

export function useLayoutMeta() {
  const [layoutMeta, layoutDispatch] = useReducer(layoutMetaReducer, initialLayoutMetaState);

  const handleSaveComplete = useCallback((layoutId: number, name: string, revision?: number) => {
    layoutDispatch({ type: 'SAVE_COMPLETE', payload: { id: layoutId, name, ...(revision !== undefined ? { revision } : {}) } });
  }, []);

  const handleClearLayout = useCallback(() => {
    layoutDispatch({ type: 'CLEAR_LAYOUT' });
  }, []);

  return {
    layoutMeta,
    layoutDispatch,
    handleSaveComplete,
    handleClearLayout,
  };
}

export type { LayoutMetaState };
