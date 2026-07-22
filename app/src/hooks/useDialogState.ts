import { useReducer, useCallback } from 'react';
import { dialogReducer, initialDialogState } from '../reducers/dialogReducer';

export function useDialogState() {
  const [dialogs, dialogDispatch] = useReducer(dialogReducer, initialDialogState);

  const openRebind = useCallback((targetId: string) => {
    dialogDispatch({ type: 'OPEN_REBIND', targetId });
  }, []);

  const closeRebind = useCallback(() => {
    dialogDispatch({ type: 'CLOSE_REBIND' });
  }, []);

  return {
    dialogs,
    dialogDispatch,
    openRebind,
    closeRebind,
  };
}
