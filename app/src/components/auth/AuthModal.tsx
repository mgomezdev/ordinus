import { useState, useEffect, useRef } from 'react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

type AuthTab = 'login' | 'register';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: AuthTab;
}

export function AuthModal({ isOpen, onClose, initialTab = 'login' }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="auth-modal"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-label={activeTab === 'login' ? 'Log in' : 'Create account'}
      >
        <div className="auth-modal-header">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => setActiveTab('login')}
              type="button"
            >
              Log In
            </button>
            <button
              className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
              type="button"
            >
              Register
            </button>
          </div>
          <button
            className="auth-modal-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            x
          </button>
        </div>
        <div className="auth-modal-body">
          {activeTab === 'login' ? (
            <LoginForm
              onSwitchToRegister={() => setActiveTab('register')}
              onSuccess={onClose}
            />
          ) : (
            <RegisterForm
              onSwitchToLogin={() => setActiveTab('login')}
              onSuccess={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
