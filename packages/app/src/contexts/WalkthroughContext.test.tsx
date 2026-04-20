import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WalkthroughProvider, useWalkthrough, WALKTHROUGH_STEPS } from './WalkthroughContext';
import { STORAGE_KEYS } from '../utils/storageKeys';

function TestConsumer() {
  const { isActive, currentStep, startTour, nextStep, dismissTour } = useWalkthrough();
  return (
    <div>
      <span data-testid="active">{String(isActive)}</span>
      <span data-testid="step">{currentStep}</span>
      <button onClick={startTour}>start</button>
      <button onClick={nextStep}>next</button>
      <button onClick={dismissTour}>dismiss</button>
    </div>
  );
}

function renderWithProvider() {
  return render(<WalkthroughProvider><TestConsumer /></WalkthroughProvider>);
}

describe('WalkthroughContext', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('starts inactive', () => {
    renderWithProvider();
    expect(screen.getByTestId('active').textContent).toBe('false');
    expect(screen.getByTestId('step').textContent).toBe('0');
  });

  it('startTour sets isActive true and currentStep 0', () => {
    renderWithProvider();
    act(() => screen.getByText('start').click());
    expect(screen.getByTestId('active').textContent).toBe('true');
    expect(screen.getByTestId('step').textContent).toBe('0');
  });

  it('startTour resets currentStep to 0 when called mid-tour', () => {
    renderWithProvider();
    act(() => screen.getByText('start').click());
    act(() => screen.getByText('next').click()); // advance to step 1
    expect(screen.getByTestId('step').textContent).toBe('1');
    act(() => screen.getByText('start').click()); // restart
    expect(screen.getByTestId('step').textContent).toBe('0');
    expect(screen.getByTestId('active').textContent).toBe('true');
  });

  it('nextStep advances currentStep', () => {
    renderWithProvider();
    act(() => screen.getByText('start').click());
    act(() => screen.getByText('next').click());
    expect(screen.getByTestId('step').textContent).toBe('1');
  });

  it('nextStep on last step calls dismissTour', () => {
    renderWithProvider();
    act(() => screen.getByText('start').click());
    // advance to last step
    for (let i = 0; i < WALKTHROUGH_STEPS.length - 1; i++) {
      act(() => screen.getByText('next').click());
    }
    act(() => screen.getByText('next').click());
    expect(screen.getByTestId('active').textContent).toBe('false');
    expect(localStorage.getItem(STORAGE_KEYS.WALKTHROUGH_SEEN)).toBe('true');
  });

  it('dismissTour sets isActive false and writes localStorage', () => {
    renderWithProvider();
    act(() => screen.getByText('start').click());
    act(() => screen.getByText('dismiss').click());
    expect(screen.getByTestId('active').textContent).toBe('false');
    expect(localStorage.getItem(STORAGE_KEYS.WALKTHROUGH_SEEN)).toBe('true');
  });

  it('useWalkthrough throws outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useWalkthrough must be used within WalkthroughProvider');
    spy.mockRestore();
  });
});
