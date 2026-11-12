import { useState } from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LiveSnapshot } from '@gridfinity/shared';
import { LivePlacementCanvas } from './LivePlacementCanvas';
const ids = ['e31b0987-e60c-4dd1-9f0a-14ef41316e79', 'ca02817f-3eae-44c3-a2b1-6bf412f760df'];
function fixture(): LiveSnapshot {
  return { revision: 7, participants: [], catalog: [{ key: 'small', name: 'Small bin', width: 1, depth: 1, snapStep: 1 }],
    bins: ids.map((stableId, index) => ({ id: index + 1, stableId, customizable: true, height: 4, lipStyle: 'normal', wallPatternEnabled: false, snapStep: 1 })),
    layout: { name: 'Drawer', gridX: 4, gridY: 4, gridResolution: 2, widthMm: 168, depthMm: 168, spacerHorizontal: 'none', spacerVertical: 'none', savedAt: '', referenceImages: [],
      bins: [0, 2].map((x, index) => ({ id: index + 1, name: 'Tray', x, y: 0, width: 2, depth: 2, rotation: 0, heightUnits: 4 })) } };
}
function mount(snapshot = fixture(), disabled = false) {
  const send = vi.fn().mockResolvedValue(8);
  function Canvas({ state }: { state: LiveSnapshot }) {
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    return <LivePlacementCanvas snapshot={state} models={[]} disabled={disabled} send={send} selected={selected} sidebar={<input aria-label="Draft height" />}
      onSelectAll={() => setSelected(new Set([1, 2]))} onSelect={(id, modifiers) => setSelected(previous => id === null ? new Set() : modifiers?.ctrl || modifiers?.shift ? new Set([...previous, id]) : new Set([id]))} />;
  }
  const view = render(<Canvas state={snapshot} />);
  const grid = screen.getByRole('group', { name: 'Drawer layout' });
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 } as DOMRect);
  return { send, view, rerender: (state: LiveSnapshot) => view.rerender(<Canvas state={state} />) };
}
it('uses workspace drag snapping, previews overlap, and freezes revision before crossing the drag threshold', () => {
  const { send, rerender } = mount();
  const bin = screen.getByRole('button', { name: /^Select bin 1:/ });
  fireEvent.pointerDown(bin, { button: 0, pointerId: 1, clientX: 25, clientY: 25 });
  const newer = fixture(); newer.revision = 8; rerender(newer);
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 125, clientY: 25 });
  expect(document.querySelector('.snap-preview--invalid')).not.toBeNull();
  fireEvent.pointerUp(document, { pointerId: 1, clientX: 125, clientY: 25 });
  expect(send).toHaveBeenCalledWith({ type: 'move', stableId: ids[0], x: 2, y: 0 }, 7);
  expect(document.querySelector('[data-drag-ghost]')).toBeNull();
});
it('flags both overlapping bins and clears the warnings after a remote correction', () => {
  const snapshot = fixture(); snapshot.layout.bins[1].x = 0;
  const { rerender } = mount(snapshot);
  expect(document.querySelectorAll('.live-bin-invalid')).toHaveLength(2);
  expect(screen.getByText(/2 bins need attention/)).toBeTruthy();
  rerender(fixture());
  expect(document.querySelectorAll('.live-bin-invalid')).toHaveLength(0);
  expect(screen.getByText('All bins fit without overlaps.')).toBeTruthy();
});
it('places a dragged library bin in nearby free space rather than on occupied cells', () => {
  const { send } = mount();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag Small bin into drawer' }), { button: 0, pointerId: 1, clientX: 500, clientY: 0 });
  fireEvent.pointerMove(document, { pointerId: 1, clientX: 25, clientY: 25 });
  fireEvent.pointerUp(document, { pointerId: 1, clientX: 25, clientY: 25 });
  expect(send).toHaveBeenCalledOnce();
  const change = send.mock.calls[0][0]; expect(change).toMatchObject({ type: 'add', catalogKey: 'small' });
  expect(change.y).toBeGreaterThanOrEqual(2);
});
it('keeps multi-selection actions atomic and ignores shortcuts inside form fields', () => {
  const { send } = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Select all', exact: true }));
  fireEvent.keyDown(screen.getByLabelText('Draft height'), { key: 'r' }); expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('group', { name: 'Drawer layout' }), { key: 'r' });
  expect(send).toHaveBeenCalledWith({ type: 'batch', changes: ids.map(stableId => ({ type: 'rotate', stableId, direction: 'cw' })) }, 7);
  fireEvent.keyDown(screen.getByRole('group', { name: 'Drawer layout' }), { key: 'c', ctrlKey: true });
  fireEvent.keyDown(screen.getByRole('group', { name: 'Drawer layout' }), { key: 'v', ctrlKey: true });
  expect(send.mock.calls[1][0].type).toBe('batch');
  expect(send.mock.calls[1][0].changes.every((change: { type: string }) => change.type === 'duplicate')).toBe(true);
});
it('blocks placement while disconnected and keeps view changes local', () => {
  const { send } = mount(fixture(), true);
  fireEvent.click(screen.getByRole('button', { name: 'Select all', exact: true }));
  fireEvent.keyDown(screen.getByRole('group', { name: 'Drawer layout' }), { key: 'Delete' });
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(screen.getByText('110%')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '3D', exact: true }));
  expect(send).not.toHaveBeenCalled();
});
