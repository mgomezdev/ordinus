import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserMenu } from './UserMenu';

// --- Mock AuthModal (shallow render) ---
vi.mock('./AuthModal', () => ({
  AuthModal: () => null,
}));

// --- Controllable auth state ---
let mockIsAuthenticated = false;
let mockIsLoading = false;
const mockLogout = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockIsAuthenticated ? { id: 1, username: 'testuser', email: 'test@example.com', role: 'user' } : null,
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
    login: vi.fn(),
    register: vi.fn(),
    logout: mockLogout,
    getAccessToken: () => (mockIsAuthenticated ? 'test-token' : null),
  }),
}));

// --- Controllable walkthrough state ---
const mockStartTour = vi.fn();
const mockNextStep = vi.fn();
const mockDismissTour = vi.fn();

interface WalkthroughOverrides {
  startTour?: () => void;
}

let walkthroughOverrides: WalkthroughOverrides = {};

vi.mock('../../contexts/WalkthroughContext', () => ({
  useWalkthrough: () => ({
    isActive: false,
    currentStep: 0,
    startTour: walkthroughOverrides.startTour ?? mockStartTour,
    nextStep: mockNextStep,
    dismissTour: mockDismissTour,
  }),
}));

// --- Helpers ---
function renderAuthenticatedUserMenu(overrides: WalkthroughOverrides = {}) {
  mockIsAuthenticated = true;
  walkthroughOverrides = overrides;
  return render(<UserMenu />);
}

function openDropdown() {
  fireEvent.click(screen.getByRole('button', { name: /testuser/i }));
}

// --- Tests ---
describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthenticated = false;
    mockIsLoading = false;
    walkthroughOverrides = {};
  });

  // ==========================================
  // Loading state
  // ==========================================
  describe('loading state', () => {
    it('renders loading indicator when isLoading is true', () => {
      mockIsLoading = true;
      render(<UserMenu />);
      expect(screen.getByText('...')).toBeInTheDocument();
    });
  });

  // ==========================================
  // Unauthenticated state
  // ==========================================
  describe('unauthenticated state', () => {
    it('renders Log In and Register buttons when not authenticated', () => {
      mockIsAuthenticated = false;
      render(<UserMenu />);
      expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument();
    });
  });

  // ==========================================
  // Authenticated state — dropdown
  // ==========================================
  describe('authenticated state', () => {
    it('renders user trigger button with username', () => {
      renderAuthenticatedUserMenu();
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    it('dropdown is not visible initially', () => {
      renderAuthenticatedUserMenu();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('opens dropdown when trigger is clicked', () => {
      renderAuthenticatedUserMenu();
      openDropdown();
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('shows username and email in dropdown', () => {
      renderAuthenticatedUserMenu();
      openDropdown();
      // 'testuser' appears in both the trigger button and the dropdown span — check the span specifically
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      // Verify the username span exists in the dropdown info section
      const usernameSpans = screen.getAllByText('testuser');
      expect(usernameSpans.length).toBeGreaterThanOrEqual(1);
    });

    it('renders Log Out button in dropdown', () => {
      renderAuthenticatedUserMenu();
      openDropdown();
      // Log Out has role="menuitem"
      expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
    });

    // ==========================================
    // Take the tour
    // ==========================================
    it('renders Take the tour button', () => {
      renderAuthenticatedUserMenu();
      openDropdown();
      expect(screen.getByRole('menuitem', { name: /take the tour/i })).toBeInTheDocument();
    });

    it('calls startTour when Take the tour is clicked', () => {
      const startTour = vi.fn();
      renderAuthenticatedUserMenu({ startTour });
      openDropdown();
      fireEvent.click(screen.getByRole('menuitem', { name: /take the tour/i }));
      expect(startTour).toHaveBeenCalledTimes(1);
    });

    it('closes dropdown when Take the tour is clicked', () => {
      renderAuthenticatedUserMenu();
      openDropdown();
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('menuitem', { name: /take the tour/i }));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('calls logout when Log Out is clicked', async () => {
      renderAuthenticatedUserMenu();
      openDropdown();
      // Log Out has role="menuitem"
      fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });
});
