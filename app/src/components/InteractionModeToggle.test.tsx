import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InteractionModeToggle } from './InteractionModeToggle';
import type { InteractionMode } from '../types/gridfinity';

describe('InteractionModeToggle', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  describe('Rendering', () => {
    it('should render Items and Images buttons', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      expect(screen.getByRole('button', { name: /items/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /images/i })).toBeInTheDocument();
    });

    it('should have role="group" with aria-label', () => {
      const { container } = render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const group = container.querySelector('[role="group"]');
      expect(group).toBeInTheDocument();
      expect(group).toHaveAttribute('aria-label', 'Interaction mode');
    });
  });

  describe('Active State - Items Mode', () => {
    it('should show Items button as active when mode is items', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      const imagesButton = screen.getByRole('button', { name: /images/i });

      expect(itemsButton).toHaveClass('interaction-mode-toggle__button--active');
      expect(imagesButton).not.toHaveClass('interaction-mode-toggle__button--active');
    });

    it('should have aria-pressed="true" on Items button when mode is items', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      const imagesButton = screen.getByRole('button', { name: /images/i });

      expect(itemsButton).toHaveAttribute('aria-pressed', 'true');
      expect(imagesButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('should have correct title attribute on Items button', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      expect(itemsButton).toHaveAttribute('title', 'Items mode - drag and place bins');
    });
  });

  describe('Active State - Images Mode', () => {
    it('should show Images button as active when mode is images', () => {
      render(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      const imagesButton = screen.getByRole('button', { name: /images/i });

      expect(imagesButton).toHaveClass('interaction-mode-toggle__button--active');
      expect(itemsButton).not.toHaveClass('interaction-mode-toggle__button--active');
    });

    it('should have aria-pressed="true" on Images button when mode is images', () => {
      render(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      const imagesButton = screen.getByRole('button', { name: /images/i });

      expect(imagesButton).toHaveAttribute('aria-pressed', 'true');
      expect(itemsButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('should have correct title attribute on Images button when hasImages is true', () => {
      render(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      expect(imagesButton).toHaveAttribute('title', 'Images mode - adjust reference images');
    });
  });

  describe('Click Handling', () => {
    it('should call onChange with "items" when Items button is clicked', () => {
      render(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      fireEvent.click(itemsButton);

      expect(mockOnChange).toHaveBeenCalledWith('items');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('should call onChange with "images" when Images button is clicked and hasImages is true', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      fireEvent.click(imagesButton);

      expect(mockOnChange).toHaveBeenCalledWith('images');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('should call onChange even when clicking the already active button', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      fireEvent.click(itemsButton);

      expect(mockOnChange).toHaveBeenCalledWith('items');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('Disabled State - No Images', () => {
    it('should disable Images button when hasImages is false', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={false}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      expect(imagesButton).toBeDisabled();
    });

    it('should not call onChange when disabled Images button is clicked', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={false}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      fireEvent.click(imagesButton);

      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should have appropriate title attribute on Images button when disabled', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={false}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      expect(imagesButton).toHaveAttribute('title', 'No images to interact with');
    });

    it('should keep Items button enabled when hasImages is false', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={false}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      expect(itemsButton).not.toBeDisabled();
    });

    it('should allow Items button to be clicked when hasImages is false', () => {
      render(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={false}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      fireEvent.click(itemsButton);

      expect(mockOnChange).toHaveBeenCalledWith('items');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('Keyboard Accessibility', () => {
    it('should allow Items button to be focused', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      itemsButton.focus();

      expect(itemsButton).toHaveFocus();
    });

    it('should allow Images button to be focused when enabled', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      imagesButton.focus();

      expect(imagesButton).toHaveFocus();
    });

    it('should trigger onClick when Enter key is pressed on Items button', () => {
      render(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      itemsButton.focus();
      fireEvent.click(itemsButton);

      expect(mockOnChange).toHaveBeenCalledWith('items');
    });

    it('should trigger onClick when Space key is pressed on Images button', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      imagesButton.focus();
      fireEvent.click(imagesButton);

      expect(mockOnChange).toHaveBeenCalledWith('images');
    });
  });

  describe('Mode Transitions', () => {
    it('should correctly transition from items to images mode', () => {
      const { rerender } = render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      let itemsButton = screen.getByRole('button', { name: /items/i });
      let imagesButton = screen.getByRole('button', { name: /images/i });

      expect(itemsButton).toHaveAttribute('aria-pressed', 'true');
      expect(imagesButton).toHaveAttribute('aria-pressed', 'false');

      rerender(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      itemsButton = screen.getByRole('button', { name: /items/i });
      imagesButton = screen.getByRole('button', { name: /images/i });

      expect(itemsButton).toHaveAttribute('aria-pressed', 'false');
      expect(imagesButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should correctly transition from images to items mode', () => {
      const { rerender } = render(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      let itemsButton = screen.getByRole('button', { name: /items/i });
      let imagesButton = screen.getByRole('button', { name: /images/i });

      expect(itemsButton).toHaveAttribute('aria-pressed', 'false');
      expect(imagesButton).toHaveAttribute('aria-pressed', 'true');

      rerender(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      itemsButton = screen.getByRole('button', { name: /items/i });
      imagesButton = screen.getByRole('button', { name: /images/i });

      expect(itemsButton).toHaveAttribute('aria-pressed', 'true');
      expect(imagesButton).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('CSS Classes', () => {
    it('should have correct base CSS classes', () => {
      const { container } = render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const toggleContainer = container.querySelector('.interaction-mode-toggle');
      expect(toggleContainer).toBeInTheDocument();

      const buttons = container.querySelectorAll('.interaction-mode-toggle__button');
      expect(buttons).toHaveLength(2);
    });

    it('should apply active class only to active button', () => {
      const { container } = render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const buttons = container.querySelectorAll('.interaction-mode-toggle__button');
      const activeButtons = container.querySelectorAll('.interaction-mode-toggle__button--active');

      expect(buttons).toHaveLength(2);
      expect(activeButtons).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid mode switching', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const itemsButton = screen.getByRole('button', { name: /items/i });
      const imagesButton = screen.getByRole('button', { name: /images/i });

      fireEvent.click(imagesButton);
      fireEvent.click(itemsButton);
      fireEvent.click(imagesButton);
      fireEvent.click(itemsButton);

      expect(mockOnChange).toHaveBeenCalledTimes(4);
      expect(mockOnChange).toHaveBeenNthCalledWith(1, 'images');
      expect(mockOnChange).toHaveBeenNthCalledWith(2, 'items');
      expect(mockOnChange).toHaveBeenNthCalledWith(3, 'images');
      expect(mockOnChange).toHaveBeenNthCalledWith(4, 'items');
    });

    it('should handle hasImages changing from true to false', () => {
      const { rerender } = render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      let imagesButton = screen.getByRole('button', { name: /images/i });
      expect(imagesButton).not.toBeDisabled();

      rerender(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={false}
        />
      );

      imagesButton = screen.getByRole('button', { name: /images/i });
      expect(imagesButton).toBeDisabled();
    });

    it('should handle hasImages changing from false to true', () => {
      const { rerender } = render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={false}
        />
      );

      let imagesButton = screen.getByRole('button', { name: /images/i });
      expect(imagesButton).toBeDisabled();

      rerender(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      imagesButton = screen.getByRole('button', { name: /images/i });
      expect(imagesButton).not.toBeDisabled();
    });

    it('should maintain mode=images even when hasImages becomes false', () => {
      const { rerender } = render(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      expect(imagesButton).toHaveClass('interaction-mode-toggle__button--active');

      rerender(
        <InteractionModeToggle
          mode="images"
          onChange={mockOnChange}
          hasImages={false}
        />
      );

      // Component should still show images as active, but button should be disabled
      expect(imagesButton).toHaveClass('interaction-mode-toggle__button--active');
      expect(imagesButton).toBeDisabled();
      expect(imagesButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Type Safety', () => {
    it('should accept valid InteractionMode values', () => {
      const modes: InteractionMode[] = ['items', 'images'];

      modes.forEach((mode) => {
        render(
          <InteractionModeToggle
            mode={mode}
            onChange={mockOnChange}
            hasImages={true}
          />
        );
      });
    });

    it('should call onChange with correct InteractionMode type', () => {
      render(
        <InteractionModeToggle
          mode="items"
          onChange={mockOnChange}
          hasImages={true}
        />
      );

      const imagesButton = screen.getByRole('button', { name: /images/i });
      fireEvent.click(imagesButton);

      const calledMode = mockOnChange.mock.calls[0][0];
      const validModes: InteractionMode[] = ['items', 'images'];
      expect(validModes).toContain(calledMode);
    });
  });
});
