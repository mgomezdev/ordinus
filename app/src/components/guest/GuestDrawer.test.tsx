import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GuestPreview } from '@gridfinity/shared';
import { GuestDrawer } from './GuestDrawer';
const layout: GuestPreview = { name: 'Drawer', gridX: 4, gridY: 4, gridResolution: 2, widthMm: 168, depthMm: 168, spacerHorizontal: 'none', spacerVertical: 'none', savedAt: '2026-11-09', referenceImages: [],
  bins: [{ id: 1, name: 'Tray', x: 0, y: 0, width: 2, depth: 2, rotation: 0, heightUnits: 4 }] };
it('snaps a pointer drag to half cells and submits the revision from pointer-down', () => {
  const move = vi.fn(), select = vi.fn();
  const view = render(<GuestDrawer layout={layout} models={[]} revision={7} onMove={move} onSelect={select} />);
  const grid = screen.getByRole('group', { name: 'Drawer layout' });
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 400 } as DOMRect);
  const bin = screen.getByRole('button', { name: /^Select bin 1:/ });
  fireEvent.pointerDown(bin, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(bin, { pointerId: 1, clientX: 110, clientY: 210 });
  view.rerender(<GuestDrawer layout={layout} models={[]} revision={8} onMove={move} onSelect={select} />);
  fireEvent.pointerUp(bin, { pointerId: 1, clientX: 110, clientY: 210 });
  expect(move).toHaveBeenCalledWith(1, 2, 4, 7);
  fireEvent.click(bin); expect(select).toHaveBeenCalledWith(1);
});
it('does not commit cancelled or disabled drags', () => {
  const move = vi.fn();
  const view = render(<GuestDrawer layout={layout} models={[]} onMove={move} />);
  const bin = screen.getByRole('button', { name: /^Select bin 1:/ });
  fireEvent.pointerDown(bin, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerCancel(bin); fireEvent.pointerUp(bin, { pointerId: 1, clientX: 100, clientY: 200 });
  view.rerender(<GuestDrawer layout={layout} models={[]} disabled onMove={move} />);
  fireEvent.pointerDown(bin, { button: 0, pointerId: 1 }); fireEvent.pointerUp(bin, { pointerId: 1 });
  expect(move).not.toHaveBeenCalled();
});
