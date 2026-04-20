import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalkthroughOverlay } from './WalkthroughOverlay';
import type { WalkthroughStep } from '../contexts/WalkthroughContext';

const steps: WalkthroughStep[] = [
  { id: 'step1', title: 'Step One Title', body: 'Step one body text.', target: '.some-element' },
  { id: 'step2', title: 'Step Two Title', body: 'Step two body text.', target: '.other-element' },
  { id: 'step3', title: 'Step Three Title', body: 'Step three body text.', target: '.third-element' },
];

function renderOverlay(props: Partial<Parameters<typeof WalkthroughOverlay>[0]> = {}) {
  const defaults = {
    isActive: true,
    currentStep: 0,
    steps,
    onNext: vi.fn(),
    onDismiss: vi.fn(),
  };
  return render(<WalkthroughOverlay {...defaults} {...props} />);
}

describe('WalkthroughOverlay', () => {
  it('renders nothing when inactive', () => {
    const { container } = renderOverlay({ isActive: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders step title and body when active', () => {
    renderOverlay({ currentStep: 0 });
    expect(screen.getByText('Step One Title')).toBeDefined();
    expect(screen.getByText('Step one body text.')).toBeDefined();
  });

  it('shows step counter', () => {
    renderOverlay({ currentStep: 1 });
    expect(screen.getByText(/step 2 of 3/i)).toBeDefined();
  });

  it('shows Next button on non-last steps', () => {
    renderOverlay({ currentStep: 0 });
    expect(screen.getByRole('button', { name: /next/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /finish/i })).toBeNull();
  });

  it('shows Finish button on last step', () => {
    renderOverlay({ currentStep: 2 });
    expect(screen.getByRole('button', { name: /finish/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^next/i })).toBeNull();
  });

  it('calls onNext when Next is clicked', () => {
    const onNext = vi.fn();
    renderOverlay({ onNext });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Skip tour is clicked', () => {
    const onDismiss = vi.fn();
    renderOverlay({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: /skip tour/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onNext (which triggers dismiss) when Finish is clicked', () => {
    const onNext = vi.fn();
    renderOverlay({ currentStep: 2, onNext });
    fireEvent.click(screen.getByRole('button', { name: /finish/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('has correct accessibility attributes', () => {
    renderOverlay({ currentStep: 0 });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('updates content when currentStep changes', () => {
    const { rerender } = renderOverlay({ currentStep: 0 });
    expect(screen.getByText('Step One Title')).toBeDefined();
    rerender(
      <WalkthroughOverlay
        isActive={true}
        currentStep={1}
        steps={steps}
        onNext={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.queryByText('Step One Title')).toBeNull();
    expect(screen.getByText('Step Two Title')).toBeDefined();
  });
});
