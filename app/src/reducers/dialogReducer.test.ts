import { describe, it, expect } from 'vitest';
import { dialogReducer, initialDialogState } from './dialogReducer';
import type { DialogState, DialogAction } from './dialogReducer';

describe('dialogReducer', () => {
  describe('initial state', () => {
    it('all dialogs are closed', () => {
      expect(initialDialogState.keyboard).toBe(false);
      expect(initialDialogState.save).toBe(false);
      expect(initialDialogState.load).toBe(false);
      expect(initialDialogState.rebind).toBe(false);
      expect(initialDialogState.admin).toBe(false);
    });

    it('rebindTargetId is null', () => {
      expect(initialDialogState.rebindTargetId).toBeNull();
    });
  });

  describe('OPEN action', () => {
    it('opens a specific dialog', () => {
      const state = dialogReducer(initialDialogState, {
        type: 'OPEN',
        dialog: 'save',
      });

      expect(state.save).toBe(true);
      expect(state.keyboard).toBe(false);
      expect(state.load).toBe(false);
      expect(state.rebind).toBe(false);
      expect(state.admin).toBe(false);
    });

    it('opens keyboard dialog', () => {
      const state = dialogReducer(initialDialogState, {
        type: 'OPEN',
        dialog: 'keyboard',
      });
      expect(state.keyboard).toBe(true);
    });

    it('opens load dialog', () => {
      const state = dialogReducer(initialDialogState, {
        type: 'OPEN',
        dialog: 'load',
      });
      expect(state.load).toBe(true);
    });

    it('opens admin dialog', () => {
      const state = dialogReducer(initialDialogState, {
        type: 'OPEN',
        dialog: 'admin',
      });
      expect(state.admin).toBe(true);
    });

    it('closes other dialogs when opening one (exclusive)', () => {
      const withSaveOpen: DialogState = {
        ...initialDialogState,
        save: true,
      };

      const state = dialogReducer(withSaveOpen, {
        type: 'OPEN',
        dialog: 'load',
      });

      expect(state.load).toBe(true);
      expect(state.save).toBe(false);
    });

    it('closes all other dialogs when opening keyboard', () => {
      const withMultipleOpen: DialogState = {
        ...initialDialogState,
        save: true,
        admin: true,
      };

      const state = dialogReducer(withMultipleOpen, {
        type: 'OPEN',
        dialog: 'keyboard',
      });

      expect(state.keyboard).toBe(true);
      expect(state.save).toBe(false);
      expect(state.admin).toBe(false);
    });
  });

  describe('CLOSE action', () => {
    it('closes a specific dialog', () => {
      const open: DialogState = {
        ...initialDialogState,
        save: true,
      };

      const state = dialogReducer(open, {
        type: 'CLOSE',
        dialog: 'save',
      });

      expect(state.save).toBe(false);
    });

    it('does not affect other dialogs', () => {
      const open: DialogState = {
        ...initialDialogState,
        save: true,
        load: true,
      };

      const state = dialogReducer(open, {
        type: 'CLOSE',
        dialog: 'save',
      });

      expect(state.save).toBe(false);
      expect(state.load).toBe(true);
    });
  });

  describe('TOGGLE action', () => {
    it('opens a closed dialog', () => {
      const state = dialogReducer(initialDialogState, {
        type: 'TOGGLE',
        dialog: 'keyboard',
      });
      expect(state.keyboard).toBe(true);
    });

    it('closes an open dialog', () => {
      const open: DialogState = {
        ...initialDialogState,
        keyboard: true,
      };

      const state = dialogReducer(open, {
        type: 'TOGGLE',
        dialog: 'keyboard',
      });
      expect(state.keyboard).toBe(false);
    });

    it('closes other dialogs when toggling one open (exclusive)', () => {
      const withSaveOpen: DialogState = {
        ...initialDialogState,
        save: true,
      };

      const state = dialogReducer(withSaveOpen, {
        type: 'TOGGLE',
        dialog: 'keyboard',
      });

      expect(state.keyboard).toBe(true);
      expect(state.save).toBe(false);
    });

    it('does not close other dialogs when toggling one closed', () => {
      const withBothOpen: DialogState = {
        ...initialDialogState,
        keyboard: true,
        save: true,
      };

      const state = dialogReducer(withBothOpen, {
        type: 'TOGGLE',
        dialog: 'keyboard',
      });

      expect(state.keyboard).toBe(false);
      expect(state.save).toBe(true);
    });
  });

  describe('OPEN_REBIND action', () => {
    it('opens rebind dialog and sets rebindTargetId', () => {
      const state = dialogReducer(initialDialogState, {
        type: 'OPEN_REBIND',
        targetId: 'img-42',
      });

      expect(state.rebind).toBe(true);
      expect(state.rebindTargetId).toBe('img-42');
    });

    it('closes other dialogs when opening rebind', () => {
      const withSaveOpen: DialogState = {
        ...initialDialogState,
        save: true,
      };

      const state = dialogReducer(withSaveOpen, {
        type: 'OPEN_REBIND',
        targetId: 'img-1',
      });

      expect(state.rebind).toBe(true);
      expect(state.save).toBe(false);
      expect(state.rebindTargetId).toBe('img-1');
    });
  });

  describe('CLOSE_REBIND action', () => {
    it('closes rebind dialog and clears rebindTargetId', () => {
      const open: DialogState = {
        ...initialDialogState,
        rebind: true,
        rebindTargetId: 'img-42',
      };

      const state = dialogReducer(open, { type: 'CLOSE_REBIND' });

      expect(state.rebind).toBe(false);
      expect(state.rebindTargetId).toBeNull();
    });
  });

  describe('unknown action type', () => {
    it('returns current state unchanged', () => {
      const existing: DialogState = {
        ...initialDialogState,
        save: true,
      };

      const state = dialogReducer(existing, { type: 'UNKNOWN' } as unknown as DialogAction);
      expect(state).toBe(existing);
    });
  });
});
