import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Child content</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Suppress React's error boundary console output during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Normal rendering', () => {
    it('should render children when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>Hello World</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should not show fallback UI when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>Content</div>
        </ErrorBoundary>
      );
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
  });

  describe('Error catching', () => {
    it('should show fallback UI when a child throws', () => {
      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should not render children when an error is caught', () => {
      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.queryByText('Child content')).not.toBeInTheDocument();
    });

    it('should log the error via componentDidCatch', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Fallback UI', () => {
    it('should show a "Reload App" button', () => {
      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByRole('button', { name: /reload app/i })).toBeInTheDocument();
    });

    it('should show a "Try Again" button', () => {
      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('should show error details when expanded', () => {
      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );

      const details = screen.getByText('Show error details');
      fireEvent.click(details);

      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    it('should mention that data is preserved', () => {
      render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );
      expect(screen.getByText(/data.*preserved/i)).toBeInTheDocument();
    });
  });

  describe('Recovery', () => {
    it('should reset error state and re-render children when "Try Again" is clicked', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ProblemChild shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Rerender with a non-throwing child, then click Try Again
      rerender(
        <ErrorBoundary>
          <ProblemChild shouldThrow={false} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      expect(screen.getByText('Child content')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
  });
});
