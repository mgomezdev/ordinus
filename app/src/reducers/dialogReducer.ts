export type DialogName = 'keyboard' | 'save' | 'rebind';

export interface DialogState {
  keyboard: boolean;
  save: boolean;
  rebind: boolean;
  rebindTargetId: string | null;
  align: boolean;
  alignTargetId: string | null;
}

export type DialogAction =
  | { type: 'OPEN'; dialog: DialogName }
  | { type: 'CLOSE'; dialog: DialogName }
  | { type: 'TOGGLE'; dialog: DialogName }
  | { type: 'OPEN_REBIND'; targetId: string }
  | { type: 'CLOSE_REBIND' }
  | { type: 'OPEN_ALIGN'; targetId: string }
  | { type: 'CLOSE_ALIGN' };

export const initialDialogState: DialogState = {
  keyboard: false,
  save: false,
  rebind: false,
  rebindTargetId: null,
  align: false,
  alignTargetId: null,
};

const closedDialogs: Pick<DialogState, DialogName> = {
  keyboard: false,
  save: false,
  rebind: false,
};

export function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, ...closedDialogs, [action.dialog]: true };
    case 'CLOSE':
      return { ...state, [action.dialog]: false };
    case 'TOGGLE':
      return state[action.dialog]
        ? { ...state, [action.dialog]: false }
        : { ...state, ...closedDialogs, [action.dialog]: true };
    case 'OPEN_REBIND':
      return { ...state, ...closedDialogs, rebind: true, rebindTargetId: action.targetId };
    case 'CLOSE_REBIND':
      return { ...state, rebind: false, rebindTargetId: null };
    case 'OPEN_ALIGN':
      return { ...state, ...closedDialogs, rebind: false, align: true, alignTargetId: action.targetId };
    case 'CLOSE_ALIGN':
      return { ...state, align: false, alignTargetId: null };
    default:
      return state;
  }
}
