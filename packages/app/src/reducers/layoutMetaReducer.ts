import type { LayoutStatus } from '@gridfinity/shared';

export interface LayoutMetaState {
  id: number | null;
  name: string;
  description: string;
  status: LayoutStatus | null;
  owner: string;
  submissionId: number | null;
}

export type LayoutMetaAction =
  | { type: 'LOAD_LAYOUT'; payload: { id: number; name: string; description: string; status: LayoutStatus | null; owner: string } }
  | { type: 'CLEAR_LAYOUT' }
  | { type: 'SAVE_COMPLETE'; payload: { id: number; name: string; status: LayoutStatus } }
  | { type: 'CLONE_COMPLETE'; payload: { id: number; name: string; status: LayoutStatus } }
  | { type: 'SET_STATUS'; payload: LayoutStatus | null }
  | { type: 'SET_SUBMISSION_ID'; payload: number | null };

export const initialLayoutMetaState: LayoutMetaState = {
  id: null,
  name: '',
  description: '',
  status: null,
  owner: '',
  submissionId: null,
};

export function layoutMetaReducer(state: LayoutMetaState, action: LayoutMetaAction): LayoutMetaState {
  switch (action.type) {
    case 'LOAD_LAYOUT':
      return { ...initialLayoutMetaState, ...action.payload };
    case 'CLEAR_LAYOUT':
      return { ...initialLayoutMetaState };
    case 'SAVE_COMPLETE':
      return {
        ...state,
        id: action.payload.id,
        name: action.payload.name,
        status: action.payload.status,
      };
    case 'CLONE_COMPLETE':
      return {
        ...state,
        id: action.payload.id,
        name: action.payload.name,
        status: action.payload.status,
        submissionId: null,
      };
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_SUBMISSION_ID':
      return { ...state, submissionId: action.payload };
    default:
      return state;
  }
}
