import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useConfirmDialog } from './useConfirmDialog';

describe('useConfirmDialog', () => {
  it('returns dialogProps with open=false initially', () => {
    const { result } = renderHook(() => useConfirmDialog());
    expect(result.current.dialogProps.open).toBe(false);
  });

  it('confirm() opens the dialog with provided options', async () => {
    const { result } = renderHook(() => useConfirmDialog());

    // Start a confirm call (don't await yet)
    act(() => {
      result.current.confirm({
        title: 'Test Title',
        message: 'Test message',
      });
    });

    expect(result.current.dialogProps.open).toBe(true);
    expect(result.current.dialogProps.title).toBe('Test Title');
    expect(result.current.dialogProps.message).toBe('Test message');
  });

  it('resolves true when confirmed', async () => {
    const { result } = renderHook(() => useConfirmDialog());

    let resolved: boolean | undefined;
    act(() => {
      result.current.confirm({
        title: 'Confirm',
        message: 'Proceed?',
      }).then(val => { resolved = val; });
    });

    expect(result.current.dialogProps.open).toBe(true);

    // Simulate confirm
    act(() => {
      result.current.dialogProps.onConfirm();
    });

    expect(result.current.dialogProps.open).toBe(false);
    // Wait for microtask
    await act(async () => {});
    expect(resolved).toBe(true);
  });

  it('resolves false when cancelled', async () => {
    const { result } = renderHook(() => useConfirmDialog());

    let resolved: boolean | undefined;
    act(() => {
      result.current.confirm({
        title: 'Confirm',
        message: 'Proceed?',
      }).then(val => { resolved = val; });
    });

    expect(result.current.dialogProps.open).toBe(true);

    // Simulate cancel
    act(() => {
      result.current.dialogProps.onCancel();
    });

    expect(result.current.dialogProps.open).toBe(false);
    await act(async () => {});
    expect(resolved).toBe(false);
  });

  it('passes optional confirmLabel, cancelLabel, and variant', () => {
    const { result } = renderHook(() => useConfirmDialog());

    act(() => {
      result.current.confirm({
        title: 'Delete',
        message: 'Delete this?',
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        variant: 'danger',
      });
    });

    expect(result.current.dialogProps.confirmLabel).toBe('Delete');
    expect(result.current.dialogProps.cancelLabel).toBe('Keep');
    expect(result.current.dialogProps.variant).toBe('danger');
  });

  it('handles multiple sequential confirmations', async () => {
    const { result } = renderHook(() => useConfirmDialog());

    // First confirmation - confirm
    let first: boolean | undefined;
    act(() => {
      result.current.confirm({ title: 'First', message: 'First?' })
        .then(val => { first = val; });
    });
    act(() => { result.current.dialogProps.onConfirm(); });
    await act(async () => {});
    expect(first).toBe(true);

    // Second confirmation - cancel
    let second: boolean | undefined;
    act(() => {
      result.current.confirm({ title: 'Second', message: 'Second?' })
        .then(val => { second = val; });
    });
    act(() => { result.current.dialogProps.onCancel(); });
    await act(async () => {});
    expect(second).toBe(false);
  });
});
