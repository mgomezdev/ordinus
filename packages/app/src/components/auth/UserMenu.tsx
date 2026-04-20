import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWalkthrough } from '../../contexts/WalkthroughContext';
import { AuthModal } from './AuthModal';

interface UserMenuProps {
  openAuth?: boolean;
  onAuthClosed?: () => void;
}

export function UserMenu({ openAuth, onAuthClosed }: UserMenuProps) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { startTour } = useWalkthrough();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');

  // If already logged in when auth is requested, notify parent immediately
  useEffect(() => {
    if (openAuth && isAuthenticated) {
      onAuthClosed?.();
    }
  }, [openAuth, isAuthenticated, onAuthClosed]);

  // Derive effective modal visibility: open if manually triggered OR externally requested while not authenticated
  const effectiveShowModal = showAuthModal || (openAuth === true && !isAuthenticated);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;

    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  if (isLoading) {
    return <div className="user-menu-loading">...</div>;
  }

  if (!isAuthenticated) {
    return (
      <>
        <div className="user-menu-auth-buttons">
          <button
            className="user-menu-login-btn"
            onClick={() => { setAuthTab('login'); setShowAuthModal(true); }}
            type="button"
          >
            Log In
          </button>
          <button
            className="user-menu-register-btn"
            onClick={() => { setAuthTab('register'); setShowAuthModal(true); }}
            type="button"
          >
            Register
          </button>
        </div>
        <AuthModal
          isOpen={effectiveShowModal}
          onClose={() => { setShowAuthModal(false); onAuthClosed?.(); }}
          initialTab={authTab}
        />
      </>
    );
  }

  const handleLogout = async () => {
    setShowDropdown(false);
    await logout();
  };

  return (
    <div className="user-menu" ref={dropdownRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setShowDropdown(!showDropdown)}
        type="button"
        aria-expanded={showDropdown}
        aria-haspopup="true"
      >
        {user?.username ?? 'User'}
      </button>
      {showDropdown && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-info">
            <span className="user-menu-username">{user?.username}</span>
            <span className="user-menu-email">{user?.email}</span>
          </div>
          <hr className="user-menu-divider" />
          <button
            className="user-menu-item"
            onClick={() => { setShowDropdown(false); startTour(); }}
            type="button"
            role="menuitem"
          >
            Take the tour
          </button>
          <hr className="user-menu-divider" />
          <button
            className="user-menu-item"
            onClick={handleLogout}
            type="button"
            role="menuitem"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
