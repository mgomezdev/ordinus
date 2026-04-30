export interface LayoutMetaState {
  id: number | null;
  name: string;
  description: string;
  owner: string;
}

export type LayoutMetaAction =
  | { type: 'LOAD_LAYOUT'; payload: { id: number; name: string; description: string; owner: string } }
  | { type: 'CLEAR_LAYOUT' }
  | { type: 'SAVE_COMPLETE'; payload: { id: number; name: string } }
  | { type: 'CLONE_COMPLETE'; payload: { id: number; name: string } };

export const initialLayoutMetaState: LayoutMetaState = {
  id: null,
  name: '',
  description: '',
  owner: '',
};

export function layoutMetaReducer(state: LayoutMetaState, action: LayoutMetaAction): LayoutMetaState {
  switch (action.type) {
    case 'LOAD_LAYOUT':
      return { ...initialLayoutMetaState, ...action.payload };
    case 'CLEAR_LAYOUT':
      return { ...initialLayoutMetaState };
    case 'SAVE_COMPLETE':
      return { ...state, id: action.payload.id, name: action.payload.name };
    case 'CLONE_COMPLETE':
      return { ...state, id: action.payload.id, name: action.payload.name };
    default:
      return state;
  }
}
