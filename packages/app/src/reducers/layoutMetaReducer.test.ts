import { describe, it, expect } from 'vitest';
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

    it('has empty owner', () => {
      expect(initialLayoutMetaState.owner).toBe('');
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
          owner: 'alice<alice@example.com>',
        },
      };

      const state = layoutMetaReducer(initialLayoutMetaState, action);

      expect(state.id).toBe(42);
      expect(state.name).toBe('My Layout');
      expect(state.description).toBe('A description');
      expect(state.owner).toBe('alice<alice@example.com>');
    });

    it('overwrites existing state completely', () => {
      const existing: LayoutMetaState = {
        id: 1,
        name: 'Old',
        description: 'Old desc',
        owner: 'bob',
      };

      const action: LayoutMetaAction = {
        type: 'LOAD_LAYOUT',
        payload: {
          id: 99,
          name: 'New',
          description: 'New desc',
          owner: 'charlie',
        },
      };

      const state = layoutMetaReducer(existing, action);
      expect(state.id).toBe(99);
      expect(state.name).toBe('New');
      expect(state.description).toBe('New desc');
      expect(state.owner).toBe('charlie');
    });
  });

  describe('CLEAR_LAYOUT action', () => {
    it('resets to initial state', () => {
      const existing: LayoutMetaState = {
        id: 42,
        name: 'Test Layout',
        description: 'Some desc',
        owner: 'user1',
      };

      const state = layoutMetaReducer(existing, { type: 'CLEAR_LAYOUT' });

      expect(state).toEqual(initialLayoutMetaState);
    });
  });

  describe('SAVE_COMPLETE action', () => {
    it('updates id and name', () => {
      const existing: LayoutMetaState = {
        id: null,
        name: '',
        description: '',
        owner: '',
      };

      const state = layoutMetaReducer(existing, {
        type: 'SAVE_COMPLETE',
        payload: { id: 77, name: 'Saved Layout' },
      });

      expect(state.id).toBe(77);
      expect(state.name).toBe('Saved Layout');
      expect(state.description).toBe('');
      expect(state.owner).toBe('');
    });

    it('preserves description and owner from existing state', () => {
      const existing: LayoutMetaState = {
        id: 10,
        name: 'Old',
        description: 'Keep this',
        owner: 'keep-owner',
      };

      const state = layoutMetaReducer(existing, {
        type: 'SAVE_COMPLETE',
        payload: { id: 10, name: 'Updated' },
      });

      expect(state.description).toBe('Keep this');
      expect(state.owner).toBe('keep-owner');
    });
  });

  describe('CLONE_COMPLETE action', () => {
    it('updates id and name', () => {
      const existing: LayoutMetaState = {
        id: 10,
        name: 'Original',
        description: 'Desc',
        owner: 'alice',
      };

      const state = layoutMetaReducer(existing, {
        type: 'CLONE_COMPLETE',
        payload: { id: 20, name: 'Original (Copy)' },
      });

      expect(state.id).toBe(20);
      expect(state.name).toBe('Original (Copy)');
    });

    it('preserves description and owner from existing state', () => {
      const existing: LayoutMetaState = {
        id: 10,
        name: 'Original',
        description: 'Keep desc',
        owner: 'alice',
      };

      const state = layoutMetaReducer(existing, {
        type: 'CLONE_COMPLETE',
        payload: { id: 20, name: 'Clone' },
      });

      expect(state.description).toBe('Keep desc');
      expect(state.owner).toBe('alice');
    });
  });

  describe('unknown action type', () => {
    it('returns current state unchanged', () => {
      const existing: LayoutMetaState = {
        id: 42,
        name: 'Test',
        description: 'Desc',
        owner: 'alice',
      };

      const state = layoutMetaReducer(existing, { type: 'UNKNOWN' } as unknown as LayoutMetaAction);
      expect(state).toBe(existing);
    });
  });
});

