import { useState } from 'react';

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReset: () => void;
}

export function ErrorFallback({ error, errorInfo, onReset }: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="error-fallback">
      <div className="error-fallback-card">
        <div className="error-fallback-icon" aria-hidden="true">!</div>
        <h1 className="error-fallback-title">Something went wrong</h1>
        <p className="error-fallback-message">
          An unexpected error occurred. Your data is preserved in local storage.
        </p>

        <div className="error-fallback-actions">
          <button className="error-fallback-btn error-fallback-btn-primary" onClick={onReset}>
            Try Again
          </button>
          <button
            className="error-fallback-btn error-fallback-btn-secondary"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>

        <div className="error-fallback-details-section">
          <button
            className="error-fallback-details-toggle"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? 'Hide error details' : 'Show error details'}
          </button>

          {showDetails && (
            <div className="error-fallback-details">
              {error && (
                <div className="error-fallback-detail-block">
                  <h3>Error</h3>
                  <pre>{error.message}</pre>
                  {error.stack && <pre className="error-fallback-stack">{error.stack}</pre>}
                </div>
              )}
              {errorInfo?.componentStack && (
                <div className="error-fallback-detail-block">
                  <h3>Component Stack</h3>
                  <pre className="error-fallback-stack">{errorInfo.componentStack}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
