import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawFootprint, rectangleFromPoints } from './DrawFootprint';

describe('drawing footprints', () => {
  it('normalizes reverse directions into integer half-cell footprints', () => {
    expect(rectangleFromPoints({ x: 7, y: 5 }, { x: 2, y: 1 })).toEqual({ x: 2, y: 1, width: 5, depth: 4 });
    expect(rectangleFromPoints({ x: 1, y: 1 }, { x: 1, y: 4 })).toBeNull();
  });
  it('shows dimensions and validity in text and cancels with Escape', () => {
    const cancel = vi.fn();
    render(<DrawFootprint gridX={4} gridY={4} drawing selection={{ x: 0, y: 0, width: 4, depth: 6 }} valid={false} onChange={vi.fn()} onFinish={vi.fn()} onCancel={cancel} />);
    expect(screen.getByText('2 × 3 · Cannot place here')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: /Draw bin footprint/ }), { key: 'Escape' });
    expect(cancel).toHaveBeenCalled();
  });
  it('tracks a primary drag in transformed coordinates and finishes without committing any layout', () => {
    const onChange = vi.fn(), onFinish = vi.fn(), onCancel = vi.fn();
    render(<DrawFootprint gridX={4} gridY={4} drawing selection={null} valid onChange={onChange} onFinish={onFinish} onCancel={onCancel} />);
    const surface = screen.getByRole('button', { name: /Draw bin footprint/ });
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 50, left: 100, top: 50, width: 800, height: 800, bottom: 850, right: 900, toJSON: () => ({}) });
    fireEvent.pointerDown(surface, { pointerId: 1, isPrimary: true, clientX: 700, clientY: 450, button: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 300, clientY: 150 });
    expect(onChange).toHaveBeenLastCalledWith({ x: 2, y: 1, width: 4, depth: 3 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 300, clientY: 150 });
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(surface);
  });
  it('leaves Space/middle-button panning alone and cancels a second touch', () => {
    const change = vi.fn(), cancel = vi.fn();
    const { rerender } = render(<DrawFootprint gridX={4} gridY={4} drawing selection={null} valid onChange={change} onFinish={vi.fn()} onCancel={cancel} isPanning={() => true} />);
    const surface = screen.getByRole('button', { name: /Draw bin footprint/ });
    fireEvent.pointerDown(surface, { isPrimary: true, button: 0 });
    expect(change).not.toHaveBeenCalled();
    rerender(<DrawFootprint gridX={4} gridY={4} drawing selection={null} valid onChange={change} onFinish={vi.fn()} onCancel={cancel} />);
    fireEvent.pointerDown(surface, { isPrimary: true, button: 1 });
    expect(change).not.toHaveBeenCalled();
    fireEvent.pointerDown(surface, { isPrimary: false });
    expect(cancel).toHaveBeenCalledOnce();
    fireEvent.pointerCancel(surface);
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
