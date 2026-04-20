import { useReducer, useCallback } from 'react';
import { dialogReducer, initialDialogState } from '../reducers/dialogReducer';
import type { DialogName } from '../reducers/dialogReducer';

export function useDialogState() {
  const [dialogs, dialogDispatch] = useReducer(dialogReducer, initialDialogState);

  const openDialog = useCallback((dialog: DialogName) => {
    dialogDispatch({ type: 'OPEN', dialog });
  }, []);

  const closeDialog = useCallback((dialog: DialogName) => {
    dialogDispatch({ type: 'CLOSE', dialog });
  }, []);

  const toggleDialog = useCallback((dialog: DialogName) => {
    dialogDispatch({ type: 'TOGGLE', dialog });
  }, []);

  const openRebind = useCallback((targetId: string) => {
    dialogDispatch({ type: 'OPEN_REBIND', targetId });
  }, []);

  const closeRebind = useCallback(() => {
    dialogDispatch({ type: 'CLOSE_REBIND' });
  }, []);

  return {
    dialogs,
    dialogDispatch,
    openDialog,
    closeDialog,
    toggleDialog,
    openRebind,
    closeRebind,
  };
}
