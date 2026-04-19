import { describe, it, expect } from 'vitest';
import type { LayoutStatus } from '@gridfinity/shared';
import { layoutMetaReducer, initialLayoutMetaState } from './layoutMetaReducer';
import type { LayoutMetaState, LayoutMetaAction } from './layoutMetaReducer';

describe('layoutMetaReducer', () => {
  describe('initial state', () => {
    it('has null id', () => {
      expect(initialLayoutMetaState.id).toBeNull();
    });

    it('has empty name', () => {
      expect(initialLayoutMetaState.name).toBe('');
    });

    it('has empty description', () => {
      expect(initialLayoutMetaState.description).toBe('');
    });

    it('has null status', () => {
      expect(initialLayoutMetaState.status).toBeNull();
    });

    it('has empty owner', () => {
      expect(initialLayoutMetaState.owner).toBe('');
    });

    it('has null submissionId', () => {
      expect(initialLayoutMetaState.submissionId).toBeNull();
    });
  });

  describe('LOAD_LAYOUT action', () => {
    it('sets all layout metadata fields', () => {
      const action: LayoutMetaAction = {
        type: 'LOAD_LAYOUT',
        payload: {
          id: 42,
          name: 'My Layout',
          description: 'A description',
          status: 'draft' as LayoutStatus,
          owner: 'alice<alice@example.com>',
        },
      };

      const state = layoutMetaReducer(initialLayoutMetaState, action);

      expect(state.id).toBe(42);
      expect(state.name).toBe('My Layout');
      expect(state.description).toBe('A description');
      expect(state.status).toBe('draft');
      expect(state.owner).toBe('alice<alice@example.com>');
    });

    it('overwrites existing state completely', () => {
      const existing: LayoutMetaState = {
        id: 1,
        name: 'Old',
        description: 'Old desc',
        status: 'submitted',
        owner: 'bob',
        submissionId: null,
      };

      const action: LayoutMetaAction = {
        type: 'LOAD_LAYOUT',
        payload: {
          id: 99,
          name: 'New',
          description: 'New desc',
          status: 'delivered' as LayoutStatus,
          owner: 'charlie',
        },
      };

      const state = layoutMetaReducer(existing, action);
      expect(state.id).toBe(99);
      expect(state.name).toBe('New');
      expect(state.description).toBe('New desc');
      expect(state.status).toBe('delivered');
      expect(state.owner).toBe('charlie');
    });
  });

  describe('CLEAR_LAYOUT action', () => {
    it('resets to initial state', () => {
      const existing: LayoutMetaState = {
        id: 42,
        name: 'Test Layout',
        description: 'Some desc',
        status: 'draft',
        owner: 'user1',
        submissionId: null,
      };

      const state = layoutMetaReducer(existing, { type: 'CLEAR_LAYOUT' });

      expect(state).toEqual(initialLayoutMetaState);
    });
  });

  describe('SAVE_COMPLETE action', () => {
    it('updates id, name, and status', () => {
      const existing: LayoutMetaState = {
        id: null,
        name: '',
        description: '',
        status: null,
        owner: '',
        submissionId: null,
      };

      const state = layoutMetaReducer(existing, {
        type: 'SAVE_COMPLETE',
        payload: { id: 77, name: 'Saved Layout', status: 'draft' as LayoutStatus },
      });

      expect(state.id).toBe(77);
      expect(state.name).toBe('Saved Layout');
      expect(state.status).toBe('draft');
      expect(state.description).toBe('');
      expect(state.owner).toBe('');
    });

    it('preserves description and owner from existing state', () => {
      const existing: LayoutMetaState = {
        id: 10,
        name: 'Old',
        description: 'Keep this',
        status: 'draft',
        owner: 'keep-owner',
        submissionId: null,
      };

      const state = layoutMetaReducer(existing, {
        type: 'SAVE_COMPLETE',
        payload: { id: 10, name: 'Updated', status: 'submitted' as LayoutStatus },
      });

      expect(state.description).toBe('Keep this');
      expect(state.owner).toBe('keep-owner');
    });
  });

  describe('CLONE_COMPLETE action', () => {
    it('updates id, name, and status', () => {
      const existing: LayoutMetaState = {
        id: 10,
        name: 'Original',
        description: 'Desc',
        status: 'delivered',
        owner: 'alice',
        submissionId: 5,
      };

      const state = layoutMetaReducer(existing, {
        type: 'CLONE_COMPLETE',
        payload: { id: 20, name: 'Original (Copy)', status: 'draft' as LayoutStatus },
      });

      expect(state.id).toBe(20);
      expect(state.name).toBe('Original (Copy)');
      expect(state.status).toBe('draft');
    });

    it('preserves description and owner from existing state', () => {
      const existing: LayoutMetaState = {
        id: 10,
        name: 'Original',
        description: 'Keep desc',
        status: 'delivered',
        owner: 'alice',
        submissionId: null,
      };

      const state = layoutMetaReducer(existing, {
        type: 'CLONE_COMPLETE',
        payload: { id: 20, name: 'Clone', status: 'draft' as LayoutStatus },
      });

      expect(state.description).toBe('Keep desc');
      expect(state.owner).toBe('alice');
    });
  });

  describe('SET_STATUS action', () => {
    it('updates only the status field', () => {
      const existing: LayoutMetaState = {
        id: 42,
        name: 'Test Layout',
        description: 'Desc',
        status: 'draft',
        owner: 'alice',
        submissionId: null,
      };

      const state = layoutMetaReducer(existing, {
        type: 'SET_STATUS',
        payload: 'submitted',
      });

      expect(state.status).toBe('submitted');
      expect(state.id).toBe(42);
      expect(state.name).toBe('Test Layout');
      expect(state.description).toBe('Desc');
      expect(state.owner).toBe('alice');
    });

    it('can set status to null', () => {
      const existing: LayoutMetaState = {
        id: 42,
        name: 'Test',
        description: '',
        status: 'draft',
        owner: '',
        submissionId: null,
      };

      const state = layoutMetaReducer(existing, {
        type: 'SET_STATUS',
        payload: null,
      });

      expect(state.status).toBeNull();
    });
  });

  describe('SET_SUBMISSION_ID action', () => {
    it('sets submissionId and preserves other fields', () => {
      const existing: LayoutMetaState = {
        id: 42,
        name: 'Test Layout',
        description: 'Desc',
        status: 'submitted',
        owner: 'alice',
        submissionId: null,
      };

      const state = layoutMetaReducer(existing, {
        type: 'SET_SUBMISSION_ID',
        payload: 99,
      });

      expect(state.submissionId).toBe(99);
      expect(state.id).toBe(42);
      expect(state.status).toBe('submitted');
    });

    it('can set submissionId to null', () => {
      const existing: LayoutMetaState = {
        id: 42,
        name: 'Test',
        description: '',
        status: 'submitted',
        owner: '',
        submissionId: 7,
      };

      const state = layoutMetaReducer(existing, {
        type: 'SET_SUBMISSION_ID',
        payload: null,
      });

      expect(state.submissionId).toBeNull();
    });
  });

  describe('CLONE_COMPLETE submissionId reset', () => {
    it('resets submissionId to null on clone', () => {
      const existing: LayoutMetaState = {
        id: 10,
        name: 'Original',
        description: 'Desc',
        status: 'submitted',
        owner: 'alice',
        submissionId: 5,
      };

      const state = layoutMetaReducer(existing, {
        type: 'CLONE_COMPLETE',
        payload: { id: 20, name: 'Clone', status: 'draft' as LayoutStatus },
      });

      expect(state.submissionId).toBeNull();
    });
  });

  describe('unknown action type', () => {
    it('returns current state unchanged', () => {
      const existing: LayoutMetaState = {
        id: 42,
        name: 'Test',
        description: 'Desc',
        status: 'draft',
        owner: 'alice',
        submissionId: null,
      };

      const state = layoutMetaReducer(existing, { type: 'UNKNOWN' } as unknown as LayoutMetaAction);
      expect(state).toBe(existing);
    });
  });
});
