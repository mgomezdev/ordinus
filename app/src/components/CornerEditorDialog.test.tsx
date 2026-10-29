import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Quad } from '@gridfinity/shared';
import { CornerEditorDialog } from './CornerEditorDialog';

const NEAR_RECT: Quad = [
  { x: 0.12, y: 0.1 },
  { x: 0.9, y: 0.12 },
  { x: 0.88, y: 0.9 },
  { x: 0.1, y: 0.88 },
];

// Drawer shot at an angle: far (top) edge narrower than near edge
const TRAPEZOID: Quad = [
  { x: 0.3, y: 0.2 },
  { x: 0.7, y: 0.2 },
  { x: 0.9, y: 0.8 },
  { x: 0.1, y: 0.8 },
];

// Base angles ~30°: beyond the supported range
const TOO_STEEP: Quad = [
  { x: 0.45, y: 0.6 },
  { x: 0.55, y: 0.6 },
  { x: 1, y: 0.9 },
  { x: 0, y: 0.9 },
];

function renderDialog(props: Partial<React.ComponentProps<typeof CornerEditorDialog>> = {}) {
  const onApply = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <CornerEditorDialog
      isOpen
      imageSrc="http://localhost/images/ref-lib/drawer.png"
      imageName="drawer.png"
      initialCorners={null}
      onApply={onApply}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { ...utils, onApply, onCancel };
}

/** Simulates the photo finishing loading at the given natural size. */
function loadImage(width: number, height: number) {
  const img = screen.getByAltText('drawer.png') as HTMLImageElement;
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: height });
  fireEvent.load(img);
}

describe('CornerEditorDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = renderDialog({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('explains the convex / 50°–135° limitation in the flow', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: /align/i });
    expect(dialog).toHaveTextContent(/convex/i);
    expect(dialog).toHaveTextContent(/50°/);
    expect(dialog).toHaveTextContent(/135°/);
  });

  it('shows four labelled, keyboard-focusable corner handles', () => {
    renderDialog();
    for (const label of ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left']) {
      expect(screen.getByRole('button', { name: new RegExp(`${label} corner`, 'i') })).toBeInTheDocument();
    }
  });

  it('starts from an inset rectangle when the image has no saved corners', () => {
    const { onApply } = renderDialog();
    loadImage(400, 300);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    const [corners] = onApply.mock.calls[0] as [Quad];
    expect(corners[0].x).toBeCloseTo(0.1);
    expect(corners[2].y).toBeCloseTo(0.9);
  });

  it('applies a near-rectangular quad (minimal distortion)', () => {
    const { onApply } = renderDialog({ initialCorners: NEAR_RECT });
    loadImage(400, 300);
    const apply = screen.getByRole('button', { name: /apply/i });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith(NEAR_RECT);
  });

  it('applies a trapezoid quad', () => {
    const { onApply } = renderDialog({ initialCorners: TRAPEZOID });
    loadImage(400, 300);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith(TRAPEZOID);
  });

  it('blocks Apply and warns when a corner angle is out of range', () => {
    const { onApply } = renderDialog({ initialCorners: TOO_STEEP });
    loadImage(400, 300);
    expect(screen.getByRole('alert')).toHaveTextContent(/between 50° and 135°/);
    const apply = screen.getByRole('button', { name: /apply/i });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('measures angles in image pixels, not normalised coordinates', () => {
    // Base angles ~72° on a square photo, but ~37° once stretched 4:1
    const quad: Quad = [{ x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }];
    renderDialog({ initialCorners: quad });
    loadImage(300, 300);
    expect(screen.getByRole('button', { name: /apply/i })).toBeEnabled();
    expect(screen.getAllByText('72°').length).toBe(2);
    loadImage(1200, 300);
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    expect(screen.getAllByText('37°').length).toBe(2);
  });

  it('nudges the focused handle with the arrow keys', () => {
    const { onApply } = renderDialog({ initialCorners: NEAR_RECT });
    loadImage(400, 300);
    const tl = screen.getByRole('button', { name: /top-left corner/i });
    fireEvent.keyDown(tl, { key: 'ArrowRight' });
    fireEvent.keyDown(tl, { key: 'ArrowDown', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    const [corners] = onApply.mock.calls[0] as [Quad];
    expect(corners[0].x).toBeGreaterThan(NEAR_RECT[0].x);
    expect(corners[0].y - NEAR_RECT[0].y).toBeGreaterThan(corners[0].x - NEAR_RECT[0].x);
    expect(corners[1]).toEqual(NEAR_RECT[1]);
  });

  it('drags a handle with pointer events (mouse or touch)', () => {
    const { onApply } = renderDialog({ initialCorners: NEAR_RECT });
    loadImage(400, 300);
    const stage = screen.getByTestId('corner-editor-stage');
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    const br = screen.getByRole('button', { name: /bottom-right corner/i });
    fireEvent.pointerDown(br, { pointerId: 1, clientX: 352, clientY: 270, pointerType: 'touch' });
    fireEvent.pointerMove(br, { pointerId: 1, clientX: 360, clientY: 285, pointerType: 'touch' });
    fireEvent.pointerUp(br, { pointerId: 1, clientX: 360, clientY: 285, pointerType: 'touch' });

    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    const [corners] = onApply.mock.calls[0] as [Quad];
    expect(corners[2].x).toBeCloseTo(0.9, 2);
    expect(corners[2].y).toBeCloseTo(0.95, 2);
  });

  it('clamps dragged handles inside the image', () => {
    const { onApply } = renderDialog({ initialCorners: NEAR_RECT });
    loadImage(400, 300);
    const stage = screen.getByTestId('corner-editor-stage');
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const tl = screen.getByRole('button', { name: /top-left corner/i });
    fireEvent.pointerDown(tl, { pointerId: 1, clientX: 48, clientY: 30 });
    fireEvent.pointerMove(tl, { pointerId: 1, clientX: -80, clientY: -50 });
    fireEvent.pointerUp(tl, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    const [corners] = onApply.mock.calls[0] as [Quad];
    expect(corners[0]).toEqual({ x: 0, y: 0 });
  });

  it('resets handles to the default rectangle', () => {
    const { onApply } = renderDialog({ initialCorners: TRAPEZOID });
    loadImage(400, 300);
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    const [corners] = onApply.mock.calls[0] as [Quad];
    expect(corners[0].x).toBeCloseTo(0.1);
    expect(corners[1].x).toBeCloseTo(0.9);
  });

  it('cancels via the Cancel button and Escape', () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('disables Apply and shows progress while applying, and surfaces errors', () => {
    renderDialog({ initialCorners: NEAR_RECT, isApplying: true, error: 'Warp failed' });
    loadImage(400, 300);
    expect(screen.getByRole('button', { name: /applying/i })).toBeDisabled();
    expect(screen.getByText('Warp failed')).toBeInTheDocument();
  });
});
