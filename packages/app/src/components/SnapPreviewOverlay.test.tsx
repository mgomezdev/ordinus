import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SnapPreviewOverlay } from './SnapPreviewOverlay';

describe('SnapPreviewOverlay', () => {
  it('renders with valid class when valid', () => {
    const { container } = render(
      <SnapPreviewOverlay col={1} row={0} w={2} d={1} valid={true} gridX={4} gridY={4} />
    );
    expect(container.firstChild).toHaveClass('snap-preview--valid');
  });

  it('renders with invalid class when not valid', () => {
    const { container } = render(
      <SnapPreviewOverlay col={0} row={0} w={2} d={1} valid={false} gridX={4} gridY={4} />
    );
    expect(container.firstChild).toHaveClass('snap-preview--invalid');
  });

  it('positions correctly using percentage-based styles', () => {
    const { container } = render(
      <SnapPreviewOverlay col={1} row={2} w={2} d={1} valid={true} gridX={4} gridY={4} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.left).toBe('25%');
    expect(el.style.top).toBe('50%');
    expect(el.style.width).toBe('50%');
    expect(el.style.height).toBe('25%');
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(
      <SnapPreviewOverlay col={0} row={0} w={1} d={1} valid={true} gridX={4} gridY={4} />
    );
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
