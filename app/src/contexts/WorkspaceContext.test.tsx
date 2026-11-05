import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
import { createTestWrapper } from '../test/testWrapper';

function renderWorkspace() {
  const Base = createTestWrapper();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </Base>
  );
  return renderHook(() => useWorkspace(), { wrapper });
}

const refPlacement = {
  refImageId: 7,
  name: 'drawer',
  imageUrl: 'ref-lib/drawer.png',
  x: 0, y: 0, width: 50, height: 50,
  opacity: 0.5, scale: 1, isLocked: false, rotation: 0 as const,
};

describe('WorkspaceContext', () => {
  it('throws outside the provider', () => {
    expect(() => renderHook(() => useWorkspace())).toThrow(/within WorkspaceProvider/);
  });

  it('derives the grid from the default 168mm drawer', () => {
    const { result } = renderWorkspace();
    expect(result.current.unitSystem).toBe('metric');
    expect(result.current.gridResult.gridX).toBe(4);
    expect(result.current.gridResult.gridY).toBe(4);
    expect(result.current.drawerWidth).toBe(168);
  });

  it('converts dimensions when switching units and back', () => {
    const { result } = renderWorkspace();
    act(() => result.current.handleUnitChange('imperial'));
    expect(result.current.unitSystem).toBe('imperial');
    expect(result.current.width).toBeCloseTo(6.6142, 3);
    expect(result.current.drawerWidth).toBeCloseTo(168, 0);

    act(() => result.current.handleUnitChange('metric'));
    expect(result.current.width).toBe(168);
  });

  it('ignores a switch to the current unit', () => {
    const { result } = renderWorkspace();
    act(() => result.current.setWidth(200));
    act(() => result.current.handleUnitChange('metric'));
    expect(result.current.width).toBe(200);
  });

  it('resets dimensions and spacers', () => {
    const { result } = renderWorkspace();
    act(() => {
      result.current.setWidth(300);
      result.current.handleUnitChange('imperial');
      result.current.setSpacerConfig({ horizontal: 'one-sided', vertical: 'symmetrical' });
    });
    act(() => result.current.handleReset());
    expect(result.current).toMatchObject({
      width: 168,
      depth: 168,
      unitSystem: 'metric',
      spacerConfig: { horizontal: 'none', vertical: 'none' },
    });
  });

  it('marks the workspace dirty on edits and clean after save', () => {
    const { result } = renderWorkspace();
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.setWidth(210));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.handleSaveComplete(5, 'Saved'));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.layoutMeta).toMatchObject({ id: 5, name: 'Saved' });
  });

  it('exposes ref image placements to the grid with alignment state', () => {
    const { result } = renderWorkspace();
    act(() => {
      result.current.addRefImagePlacement(refPlacement);
    });
    expect(result.current.referenceImagesForGrid).toHaveLength(1);
    expect(result.current.referenceImagesForGrid[0]).toMatchObject({ name: 'drawer', isAligned: false });
  });

  it('clears items and ref images only when confirmed', async () => {
    const { result } = renderWorkspace();
    act(() => {
      result.current.addRefImagePlacement(refPlacement);
      result.current.handleSaveComplete(9, 'Keep me?');
    });

    let pending: Promise<void>;
    act(() => { pending = result.current.handleClearAll(); });
    expect(result.current.confirmDialogProps.open).toBe(true);
    expect(result.current.confirmDialogProps.message).toMatch(/1 reference images/);
    act(() => result.current.confirmDialogProps.onCancel());
    await act(async () => { await pending; });
    expect(result.current.refImagePlacements).toHaveLength(1);

    act(() => { pending = result.current.handleClearAll(); });
    act(() => result.current.confirmDialogProps.onConfirm());
    await act(async () => { await pending; });
    await waitFor(() => expect(result.current.refImagePlacements).toHaveLength(0));
    expect(result.current.layoutMeta.id).toBeNull();
  });

});
