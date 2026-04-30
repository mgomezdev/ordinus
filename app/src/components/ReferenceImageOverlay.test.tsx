import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ReferenceImageOverlay } from './ReferenceImageOverlay';
import type { ReferenceImage } from '../types/gridfinity';

describe('ReferenceImageOverlay', () => {
  const mockOnPositionChange = vi.fn();
  const mockOnSelect = vi.fn();
  const mockOnScaleChange = vi.fn();
  const mockOnOpacityChange = vi.fn();
  const mockOnRemove = vi.fn();
  const mockOnToggleLock = vi.fn();

  beforeEach(() => {
    mockOnPositionChange.mockClear();
    mockOnSelect.mockClear();
    mockOnScaleChange.mockClear();
    mockOnOpacityChange.mockClear();
    mockOnRemove.mockClear();
    mockOnToggleLock.mockClear();
  });

  const createMockImage = (overrides?: Partial<ReferenceImage>): ReferenceImage => ({
    id: 'test-image-1',
    name: 'test-image.png',
    dataUrl: 'data:image/png;base64,mockBase64String',
    x: 10,
    y: 20,
    width: 50,
    height: 40,
    opacity: 0.5,
    scale: 1,
    isLocked: false,
    rotation: 0,
    ...overrides,
  });

  const defaultProps = {
    isSelected: false,
    onPositionChange: mockOnPositionChange,
    onSelect: mockOnSelect,
    onScaleChange: mockOnScaleChange,
    onOpacityChange: mockOnOpacityChange,
    onRemove: mockOnRemove,
    onToggleLock: mockOnToggleLock,
  };

  describe('Image Rendering', () => {
    it('should render image with correct src (dataUrl)', () => {
      const image = createMockImage({ dataUrl: 'data:image/png;base64,testData' });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const imgElement = container.querySelector('img');
      expect(imgElement).toBeInTheDocument();
      expect(imgElement).toHaveAttribute('src', 'data:image/png;base64,testData');
    });

    it('should use image name as alt text', () => {
      const image = createMockImage({ name: 'my-reference.jpg' });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const imgElement = container.querySelector('img');
      expect(imgElement).toHaveAttribute('alt', 'my-reference.jpg');
    });

    it('should set draggable to false on image element', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const imgElement = container.querySelector('img');
      expect(imgElement).toHaveAttribute('draggable', 'false');
    });
  });

  describe('Opacity Styling', () => {
    it('should apply opacity style on content div from image.opacity', () => {
      const image = createMockImage({ opacity: 0.7 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ opacity: '0.7' });
    });

    it('should handle opacity of 0', () => {
      const image = createMockImage({ opacity: 0 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ opacity: '0' });
    });

    it('should handle opacity of 1', () => {
      const image = createMockImage({ opacity: 1 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ opacity: '1' });
    });
  });

  describe('Scale Transform', () => {
    it('should apply scale transform on content div from image.scale', () => {
      const image = createMockImage({ scale: 1.5 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transform: 'scale(1.5)' });
    });

    it('should handle scale of 1 (no scaling)', () => {
      const image = createMockImage({ scale: 1 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transform: 'scale(1)' });
    });

    it('should handle very large scale values', () => {
      const image = createMockImage({ scale: 5 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transform: 'scale(5)' });
    });

    it('should handle small scale values', () => {
      const image = createMockImage({ scale: 0.5 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transform: 'scale(0.5)' });
    });

    it('should use top-left transform-origin so scaled-down images can reach container edges', () => {
      const image = createMockImage({ scale: 0.5, x: 0, y: 0 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transformOrigin: 'top left' });
      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({ left: '0%' });
    });
  });

  describe('Percentage-based Positioning', () => {
    it('should apply left position as percentage', () => {
      const image = createMockImage({ x: 25 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({ left: '25%' });
    });

    it('should apply top position as percentage', () => {
      const image = createMockImage({ y: 30 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({ top: '30%' });
    });

    it('should apply width as percentage', () => {
      const image = createMockImage({ width: 60 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({ width: '60%' });
    });

    it('should apply height as percentage', () => {
      const image = createMockImage({ height: 45 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({ height: '45%' });
    });

    it('should position at (0, 0) correctly', () => {
      const image = createMockImage({ x: 0, y: 0 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({ left: '0%', top: '0%' });
    });

    it('should handle 100% dimensions', () => {
      const image = createMockImage({ x: 0, y: 0, width: 100, height: 100 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({
        left: '0%',
        top: '0%',
        width: '100%',
        height: '100%',
      });
    });
  });

  describe('Pointer Events', () => {
    it('should always have pointer-events: auto', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({ pointerEvents: 'auto' });
    });
  });

  describe('CSS Classes', () => {
    it('should have base class reference-image-overlay', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveClass('reference-image-overlay');
    });

    it('should always have interactive class', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveClass('reference-image-overlay--interactive');
    });

    it('should have locked class when image.isLocked=true', () => {
      const image = createMockImage({ isLocked: true });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveClass('reference-image-overlay--locked');
    });

    it('should NOT have locked class when image.isLocked=false', () => {
      const image = createMockImage({ isLocked: false });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).not.toHaveClass('reference-image-overlay--locked');
    });

    it('should have dragging class when actively dragging', () => {
      const image = createMockImage({ isLocked: false });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).not.toHaveClass('reference-image-overlay--dragging');

      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });

      expect(overlayElement).toHaveClass('reference-image-overlay--dragging');
    });

    it('should have selected class when isSelected=true', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveClass('reference-image-overlay--selected');
    });

    it('should NOT have selected class when isSelected=false', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={false} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).not.toHaveClass('reference-image-overlay--selected');
    });
  });

  describe('Click/Select Behavior', () => {
    it('should call onSelect on pointerdown when interactive', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
    });

    it('should call onSelect when image is locked (allows selecting to unlock)', () => {
      const image = createMockImage({ isLocked: true });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });

      expect(mockOnSelect).toHaveBeenCalled();
    });

    it('should prevent default and stop propagation on pointerdown when interactive and unlocked', () => {
      const image = createMockImage({ isLocked: false });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      const event = new PointerEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      overlayElement!.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });

  describe('Drag Behavior', () => {
    it('should initiate drag on pointerdown when interactive and unlocked', () => {
      const image = createMockImage({ x: 10, y: 20, isLocked: false });
      const { container } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      fireEvent.pointerDown(overlayElement!, { clientX: 500, clientY: 400 });

      expect(overlayElement).toHaveClass('reference-image-overlay--dragging');
    });

    it('should NOT initiate drag when image is locked', () => {
      const image = createMockImage({ isLocked: true });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });

      expect(overlayElement).not.toHaveClass('reference-image-overlay--dragging');
    });

    it('should update position on pointermove during drag', () => {
      const image = createMockImage({ x: 10, y: 20, isLocked: false });

      const { container } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      const parentElement = overlayElement!.parentElement!;

      vi.spyOn(parentElement, 'getBoundingClientRect').mockReturnValue({
        width: 1000,
        height: 800,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      fireEvent.pointerDown(overlayElement!, { clientX: 500, clientY: 400 });
      fireEvent.pointerMove(document, { clientX: 600, clientY: 500 });

      expect(mockOnPositionChange).toHaveBeenCalledWith(20, 32.5);
    });

    it('should clamp position to 0-100 range during drag', () => {
      const image = createMockImage({ x: 5, y: 5, isLocked: false });

      const { container } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      const parentElement = overlayElement!.parentElement!;

      vi.spyOn(parentElement, 'getBoundingClientRect').mockReturnValue({
        width: 1000,
        height: 800,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      fireEvent.pointerDown(overlayElement!, { clientX: 500, clientY: 400 });
      fireEvent.pointerMove(document, { clientX: -1000, clientY: -1000 });

      expect(mockOnPositionChange).toHaveBeenCalledWith(0, 0);

      fireEvent.pointerMove(document, { clientX: 2000, clientY: 2000 });

      expect(mockOnPositionChange).toHaveBeenCalledWith(100, 100);
    });

    it('should end drag on pointerup', () => {
      const image = createMockImage({ isLocked: false });
      const { container } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');

      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });
      expect(overlayElement).toHaveClass('reference-image-overlay--dragging');

      fireEvent.pointerUp(document);
      expect(overlayElement).not.toHaveClass('reference-image-overlay--dragging');
    });

    it('should end drag on pointercancel', () => {
      const image = createMockImage({ isLocked: false });
      const { container } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');

      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });
      expect(overlayElement).toHaveClass('reference-image-overlay--dragging');

      fireEvent(document, new Event('pointercancel', { bubbles: true }));
      expect(overlayElement).not.toHaveClass('reference-image-overlay--dragging');
    });

    it('should not call onPositionChange on pointermove after drag ends', () => {
      const image = createMockImage({ x: 10, y: 20, isLocked: false });
      const { container } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      const parentElement = overlayElement!.parentElement!;

      vi.spyOn(parentElement, 'getBoundingClientRect').mockReturnValue({
        width: 1000, height: 800,
        left: 0, top: 0, right: 1000, bottom: 800,
        x: 0, y: 0, toJSON: () => {},
      });

      fireEvent.pointerDown(overlayElement!, { clientX: 500, clientY: 400 });
      fireEvent.pointerUp(document);

      mockOnPositionChange.mockClear();
      fireEvent.pointerMove(document, { clientX: 600, clientY: 500 });

      expect(mockOnPositionChange).not.toHaveBeenCalled();
    });

    it('should support multiple sequential drag operations', () => {
      const image = createMockImage({ x: 10, y: 20, isLocked: false });
      const { container } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      const parentElement = overlayElement!.parentElement!;

      vi.spyOn(parentElement, 'getBoundingClientRect').mockReturnValue({
        width: 1000, height: 800,
        left: 0, top: 0, right: 1000, bottom: 800,
        x: 0, y: 0, toJSON: () => {},
      });

      // First drag
      fireEvent.pointerDown(overlayElement!, { clientX: 500, clientY: 400 });
      fireEvent.pointerMove(document, { clientX: 600, clientY: 500 });
      expect(mockOnPositionChange).toHaveBeenCalledWith(20, 32.5);
      fireEvent.pointerUp(document);

      expect(overlayElement).not.toHaveClass('reference-image-overlay--dragging');

      mockOnPositionChange.mockClear();

      // Second drag from different start point
      fireEvent.pointerDown(overlayElement!, { clientX: 200, clientY: 300 });
      expect(overlayElement).toHaveClass('reference-image-overlay--dragging');
      fireEvent.pointerMove(document, { clientX: 300, clientY: 400 });
      expect(mockOnPositionChange).toHaveBeenCalledWith(20, 32.5);
      fireEvent.pointerUp(document);

      expect(overlayElement).not.toHaveClass('reference-image-overlay--dragging');
    });

    it('should calculate drag deltas from initial pointerdown position across all moves', () => {
      const image = createMockImage({ x: 50, y: 50, isLocked: false });
      const { container } = render(
        <div style={{ width: '1000px', height: '1000px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      const parentElement = overlayElement!.parentElement!;

      vi.spyOn(parentElement, 'getBoundingClientRect').mockReturnValue({
        width: 1000, height: 1000,
        left: 0, top: 0, right: 1000, bottom: 1000,
        x: 0, y: 0, toJSON: () => {},
      });

      // Start drag at (100, 100)
      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });

      // Move to (150, 150) => delta = (50, 50) => 5%, 5% => position (55, 55)
      fireEvent.pointerMove(document, { clientX: 150, clientY: 150 });
      expect(mockOnPositionChange).toHaveBeenLastCalledWith(55, 55);

      // Move to (200, 200) => delta from START = (100, 100) => 10%, 10% => position (60, 60)
      fireEvent.pointerMove(document, { clientX: 200, clientY: 200 });
      expect(mockOnPositionChange).toHaveBeenLastCalledWith(60, 60);

      // Move back to (100, 100) => delta from START = (0, 0) => position (50, 50)
      fireEvent.pointerMove(document, { clientX: 100, clientY: 100 });
      expect(mockOnPositionChange).toHaveBeenLastCalledWith(50, 50);
    });

    it('should handle drag with no parent element gracefully', () => {
      const image = createMockImage({ isLocked: false });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');

      Object.defineProperty(overlayElement, 'parentElement', {
        value: null,
        writable: true,
        configurable: true,
      });

      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });
      fireEvent.pointerMove(document, { clientX: 200, clientY: 200 });

      expect(mockOnPositionChange).not.toHaveBeenCalled();
    });

    it('should not update position during drag if no parent container', () => {
      const image = createMockImage({ isLocked: false });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');

      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });

      const originalParentElement = overlayElement!.parentElement;
      Object.defineProperty(overlayElement, 'parentElement', {
        get: () => null,
        configurable: true,
      });

      fireEvent.pointerMove(document, { clientX: 200, clientY: 200 });

      expect(mockOnPositionChange).not.toHaveBeenCalled();

      Object.defineProperty(overlayElement, 'parentElement', {
        get: () => originalParentElement,
        configurable: true,
      });
    });
  });

  describe('Inline Toolbar', () => {
    it('should NOT render toolbar when isSelected=false', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={false} />
      );

      const toolbar = container.querySelector('.reference-image-overlay__toolbar');
      expect(toolbar).not.toBeInTheDocument();
    });

    it('should render toolbar when isSelected=true', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const toolbar = container.querySelector('.reference-image-overlay__toolbar');
      expect(toolbar).toBeInTheDocument();
    });

    it('should call onOpacityChange with correct decimal value when slider changes', () => {
      const image = createMockImage({ opacity: 0.5 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const opacitySlider = container.querySelector('#opacity-slider') as HTMLInputElement;
      expect(opacitySlider).toBeInTheDocument();

      fireEvent.change(opacitySlider, { target: { value: '80' } });
      expect(mockOnOpacityChange).toHaveBeenCalledWith(0.8);
    });

    it('should call onScaleChange with correct decimal value when slider changes', () => {
      const image = createMockImage({ scale: 1 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const scaleSlider = container.querySelector('#scale-slider') as HTMLInputElement;
      expect(scaleSlider).toBeInTheDocument();

      fireEvent.change(scaleSlider, { target: { value: '150' } });
      expect(mockOnScaleChange).toHaveBeenCalledWith(1.5);
    });

    it('should call onToggleLock when lock button is clicked', () => {
      const image = createMockImage({ isLocked: false });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const lockButton = container.querySelector('.reference-image-overlay__toolbar-btn--lock');
      expect(lockButton).toBeInTheDocument();
      expect(lockButton).toHaveTextContent('Lock');

      fireEvent.click(lockButton!);
      expect(mockOnToggleLock).toHaveBeenCalledTimes(1);
    });

    it('should show "Unlock" text when image is locked', () => {
      const image = createMockImage({ isLocked: true });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const lockButton = container.querySelector('.reference-image-overlay__toolbar-btn--lock');
      expect(lockButton).toHaveTextContent('Unlock');
    });

    it('should call onRemove when remove button is clicked', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const removeButton = container.querySelector('.reference-image-overlay__toolbar-btn--remove');
      expect(removeButton).toBeInTheDocument();

      fireEvent.click(removeButton!);
      expect(mockOnRemove).toHaveBeenCalledTimes(1);
    });

    it('should stop propagation on toolbar pointerdown to prevent drag', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const toolbar = container.querySelector('.reference-image-overlay__toolbar');
      const event = new PointerEvent('pointerdown', { bubbles: true });
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      toolbar!.dispatchEvent(event);

      expect(stopPropagationSpy).toHaveBeenCalled();
    });

    it('should render toolbar outside the scaled content so it stays constant size', () => {
      const image = createMockImage({ scale: 2 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isSelected={true} />
      );

      const toolbar = container.querySelector('.reference-image-overlay__toolbar');
      const content = container.querySelector('.reference-image-overlay__content');
      // Toolbar is a sibling of content, not a child — so it's not affected by content's scale
      expect(toolbar!.parentElement).toBe(content!.parentElement);
      expect(content).toHaveStyle({ transform: 'scale(2)' });
    });
  });

  describe('Edge Cases', () => {
    it('should handle fractional percentage values', () => {
      const image = createMockImage({ x: 33.33, y: 66.67, width: 25.5, height: 12.75 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({
        left: '33.33%',
        top: '66.67%',
        width: '25.5%',
        height: '12.75%',
      });
    });

    it('should handle negative position values', () => {
      const image = createMockImage({ x: -10, y: -20 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({
        left: '-10%',
        top: '-20%',
      });
    });

    it('should handle position values greater than 100', () => {
      const image = createMockImage({ x: 150, y: 200 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({
        left: '150%',
        top: '200%',
      });
    });

    it('should combine all styling properties correctly', () => {
      const image = createMockImage({
        x: 15,
        y: 25,
        width: 60,
        height: 40,
        opacity: 0.8,
        scale: 1.2,
      });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      expect(overlayElement).toHaveStyle({
        left: '15%',
        top: '25%',
        width: '60%',
        height: '40%',
        pointerEvents: 'auto',
      });

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({
        opacity: '0.8',
        transform: 'scale(1.2)',
      });
    });

    it('should handle rapid drag movements', () => {
      const image = createMockImage({ x: 50, y: 50, isLocked: false });

      const { container } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      const parentElement = overlayElement!.parentElement!;

      vi.spyOn(parentElement, 'getBoundingClientRect').mockReturnValue({
        width: 1000,
        height: 800,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      fireEvent.pointerDown(overlayElement!, { clientX: 500, clientY: 400 });

      fireEvent.pointerMove(document, { clientX: 510, clientY: 410 });
      fireEvent.pointerMove(document, { clientX: 520, clientY: 420 });
      fireEvent.pointerMove(document, { clientX: 530, clientY: 430 });
      fireEvent.pointerMove(document, { clientX: 540, clientY: 440 });

      expect(mockOnPositionChange).toHaveBeenLastCalledWith(54, 55);
      expect(mockOnPositionChange.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Component Lifecycle', () => {
    it('should cleanup event listeners on unmount', () => {
      const image = createMockImage({ isLocked: false });
      const { container, unmount } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      fireEvent.pointerDown(overlayElement!, { clientX: 100, clientY: 100 });

      unmount();

      fireEvent.pointerMove(document, { clientX: 200, clientY: 200 });
      fireEvent.pointerUp(document);

      expect(mockOnPositionChange).not.toHaveBeenCalled();
    });

    it('should maintain original drag state when image properties change during drag', () => {
      const image = createMockImage({ x: 10, y: 20, isLocked: false });

      const { container, rerender } = render(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={image} {...defaultProps} />
        </div>
      );

      const overlayElement = container.querySelector('.reference-image-overlay');
      const parentElement = overlayElement!.parentElement!;

      vi.spyOn(parentElement, 'getBoundingClientRect').mockReturnValue({
        width: 1000,
        height: 800,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      fireEvent.pointerDown(overlayElement!, { clientX: 500, clientY: 400 });

      const updatedImage = createMockImage({ x: 30, y: 40, isLocked: false });
      rerender(
        <div style={{ width: '1000px', height: '800px' }}>
          <ReferenceImageOverlay image={updatedImage} {...defaultProps} />
        </div>
      );

      fireEvent.pointerMove(document, { clientX: 600, clientY: 500 });

      expect(mockOnPositionChange).toHaveBeenCalledWith(20, 32.5);
    });
  });

  describe('Broken State (isBroken prop)', () => {
    it('should render broken placeholder when isBroken=true', () => {
      const image = createMockImage({ name: 'deleted-image.jpg' });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isBroken={true} />
      );

      const brokenPlaceholder = container.querySelector('.ref-image-broken');
      expect(brokenPlaceholder).toBeInTheDocument();
      expect(brokenPlaceholder).toHaveTextContent('Image Removed');
      expect(brokenPlaceholder).toHaveTextContent('deleted-image.jpg');
    });

    it('should NOT render img element when isBroken=true', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isBroken={true} />
      );

      const imgElement = container.querySelector('img');
      expect(imgElement).not.toBeInTheDocument();
    });

    it('should render img element when isBroken=false (default)', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isBroken={false} />
      );

      const imgElement = container.querySelector('img');
      expect(imgElement).toBeInTheDocument();
    });

    it('should still show toolbar when isBroken and isSelected', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} isBroken={true} isSelected={true} />
      );

      const toolbar = container.querySelector('.reference-image-overlay__toolbar');
      expect(toolbar).toBeInTheDocument();
    });
  });

  describe('imageUrl prop', () => {
    it('should use imageUrl instead of dataUrl when provided', () => {
      const image = createMockImage({ dataUrl: 'data:image/png;base64,oldData' });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} imageUrl="https://example.com/image.jpg" />
      );

      const imgElement = container.querySelector('img');
      expect(imgElement).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('should fall back to dataUrl when imageUrl is null', () => {
      const image = createMockImage({ dataUrl: 'data:image/png;base64,fallbackData' });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} imageUrl={null} />
      );

      const imgElement = container.querySelector('img');
      expect(imgElement).toHaveAttribute('src', 'data:image/png;base64,fallbackData');
    });

    it('should fall back to dataUrl when imageUrl is not provided', () => {
      const image = createMockImage({ dataUrl: 'data:image/png;base64,defaultData' });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const imgElement = container.querySelector('img');
      expect(imgElement).toHaveAttribute('src', 'data:image/png;base64,defaultData');
    });
  });

  describe('Rebind Button', () => {
    const mockOnRebind = vi.fn();

    beforeEach(() => {
      mockOnRebind.mockClear();
    });

    it('should show Rebind button when isBroken=true AND onRebind is provided AND isSelected', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          isBroken={true}
          onRebind={mockOnRebind}
          isSelected={true}
        />
      );

      const rebindButton = container.querySelector('.ref-image-rebind-btn');
      expect(rebindButton).toBeInTheDocument();
      expect(rebindButton).toHaveTextContent('Rebind');
    });

    it('should NOT show Rebind button when isBroken=false', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          isBroken={false}
          onRebind={mockOnRebind}
          isSelected={true}
        />
      );

      const rebindButton = container.querySelector('.ref-image-rebind-btn');
      expect(rebindButton).not.toBeInTheDocument();
    });

    it('should NOT show Rebind button when onRebind is undefined', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          isBroken={true}
          isSelected={true}
        />
      );

      const rebindButton = container.querySelector('.ref-image-rebind-btn');
      expect(rebindButton).not.toBeInTheDocument();
    });

    it('should NOT show Rebind button when not selected', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          isBroken={true}
          onRebind={mockOnRebind}
          isSelected={false}
        />
      );

      const rebindButton = container.querySelector('.ref-image-rebind-btn');
      expect(rebindButton).not.toBeInTheDocument();
    });

    it('should call onRebind when Rebind button is clicked', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          isBroken={true}
          onRebind={mockOnRebind}
          isSelected={true}
        />
      );

      const rebindButton = container.querySelector('.ref-image-rebind-btn');
      fireEvent.click(rebindButton!);

      expect(mockOnRebind).toHaveBeenCalledTimes(1);
    });
  });

  describe('Rotation Buttons', () => {
    const mockOnRotateCw = vi.fn();
    const mockOnRotateCcw = vi.fn();

    beforeEach(() => {
      mockOnRotateCw.mockClear();
      mockOnRotateCcw.mockClear();
    });

    it('should show rotate CW button when onRotateCw is provided and isSelected', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          onRotateCw={mockOnRotateCw}
          isSelected={true}
        />
      );

      const rotateCwButton = container.querySelector('.reference-image-overlay__toolbar-btn--rotate[aria-label="Rotate clockwise"]');
      expect(rotateCwButton).toBeInTheDocument();
      expect(rotateCwButton).toHaveTextContent('↻');
    });

    it('should show rotate CCW button when onRotateCcw is provided and isSelected', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          onRotateCcw={mockOnRotateCcw}
          isSelected={true}
        />
      );

      const rotateCcwButton = container.querySelector('.reference-image-overlay__toolbar-btn--rotate[aria-label="Rotate counter-clockwise"]');
      expect(rotateCcwButton).toBeInTheDocument();
      expect(rotateCcwButton).toHaveTextContent('↺');
    });

    it('should NOT show rotate buttons when callbacks are not provided', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          isSelected={true}
        />
      );

      const rotateCwButton = container.querySelector('.reference-image-overlay__toolbar-btn--rotate[aria-label="Rotate clockwise"]');
      const rotateCcwButton = container.querySelector('.reference-image-overlay__toolbar-btn--rotate[aria-label="Rotate counter-clockwise"]');

      expect(rotateCwButton).not.toBeInTheDocument();
      expect(rotateCcwButton).not.toBeInTheDocument();
    });

    it('should call onRotateCw when CW button is clicked', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          onRotateCw={mockOnRotateCw}
          isSelected={true}
        />
      );

      const rotateCwButton = container.querySelector('.reference-image-overlay__toolbar-btn--rotate[aria-label="Rotate clockwise"]');
      fireEvent.click(rotateCwButton!);

      expect(mockOnRotateCw).toHaveBeenCalledTimes(1);
    });

    it('should call onRotateCcw when CCW button is clicked', () => {
      const image = createMockImage();
      const { container } = render(
        <ReferenceImageOverlay
          image={image}
          {...defaultProps}
          onRotateCcw={mockOnRotateCcw}
          isSelected={true}
        />
      );

      const rotateCcwButton = container.querySelector('.reference-image-overlay__toolbar-btn--rotate[aria-label="Rotate counter-clockwise"]');
      fireEvent.click(rotateCcwButton!);

      expect(mockOnRotateCcw).toHaveBeenCalledTimes(1);
    });
  });

  describe('Rotation Transform', () => {
    it('should apply rotation in transform when image.rotation is non-zero', () => {
      const image = createMockImage({ rotation: 90, scale: 1 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transform: 'scale(1) rotate(90deg)' });
    });

    it('should not add rotation when image.rotation is 0', () => {
      const image = createMockImage({ rotation: 0, scale: 1 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transform: 'scale(1)' });
    });

    it('should combine scale and rotation transforms correctly', () => {
      const image = createMockImage({ rotation: 180, scale: 1.5 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transform: 'scale(1.5) rotate(180deg)' });
    });

    it('should handle rotation of 270 degrees', () => {
      const image = createMockImage({ rotation: 270, scale: 1 });
      const { container } = render(
        <ReferenceImageOverlay image={image} {...defaultProps} />
      );

      const contentElement = container.querySelector('.reference-image-overlay__content');
      expect(contentElement).toHaveStyle({ transform: 'scale(1) rotate(270deg)' });
    });
  });

});
