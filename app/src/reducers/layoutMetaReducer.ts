export interface LayoutMetaState {
  revision?: number;
  id: number | null;
  name: string;
  description: string;
  owner: string;
}

export type LayoutMetaAction =
  | { type: 'LOAD_LAYOUT'; payload: { id: number; name: string; description: string; owner: string; revision?: number } }
  | { type: 'CLEAR_LAYOUT' }
  | { type: 'SAVE_COMPLETE'; payload: { id: number; name: string; revision?: number } };

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
      return { id: action.payload.id, name: action.payload.name, description: state.description, owner: state.owner,
        ...(action.payload.revision !== undefined ? { revision: action.payload.revision } : {}) };
    default:
      return state;
  }
}
