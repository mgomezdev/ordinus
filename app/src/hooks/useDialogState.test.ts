import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDialogState } from './useDialogState';

describe('useDialogState', () => {
  describe('Initial State', () => {
    it('should initialize with all dialogs closed', () => {
      const { result } = renderHook(() => useDialogState());
      expect(result.current.dialogs.keyboard).toBe(false);
      expect(result.current.dialogs.save).toBe(false);
      expect(result.current.dialogs.load).toBe(false);
      expect(result.current.dialogs.rebind).toBe(false);
      expect(result.current.dialogs.admin).toBe(false);
      expect(result.current.dialogs.rebindTargetId).toBeNull();
    });
  });

  describe('openDialog', () => {
    it('should open a dialog by name', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => { result.current.openDialog('keyboard'); });

      expect(result.current.dialogs.keyboard).toBe(true);
    });

    it('should close other dialogs when opening one', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => { result.current.openDialog('keyboard'); });
      act(() => { result.current.openDialog('save'); });

      expect(result.current.dialogs.keyboard).toBe(false);
      expect(result.current.dialogs.save).toBe(true);
    });
  });

  describe('closeDialog', () => {
    it('should close a specific dialog', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => { result.current.openDialog('keyboard'); });
      act(() => { result.current.closeDialog('keyboard'); });

      expect(result.current.dialogs.keyboard).toBe(false);
    });
  });

  describe('toggleDialog', () => {
    it('should open a closed dialog', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => { result.current.toggleDialog('keyboard'); });

      expect(result.current.dialogs.keyboard).toBe(true);
    });

    it('should close an open dialog', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => { result.current.openDialog('keyboard'); });
      act(() => { result.current.toggleDialog('keyboard'); });

      expect(result.current.dialogs.keyboard).toBe(false);
    });
  });

  describe('openRebind / closeRebind', () => {
    it('should open rebind dialog with target id', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => { result.current.openRebind('img-42'); });

      expect(result.current.dialogs.rebind).toBe(true);
      expect(result.current.dialogs.rebindTargetId).toBe('img-42');
    });

    it('should close rebind dialog and clear target id', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => { result.current.openRebind('img-42'); });
      act(() => { result.current.closeRebind(); });

      expect(result.current.dialogs.rebind).toBe(false);
      expect(result.current.dialogs.rebindTargetId).toBeNull();
    });
  });

  describe('dialogDispatch passthrough', () => {
    it('should expose the raw dispatch function', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.dialogDispatch({ type: 'OPEN', dialog: 'admin' });
      });

      expect(result.current.dialogs.admin).toBe(true);
    });
  });
});
