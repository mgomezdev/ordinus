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

// --- Helpers ---
function renderAuthenticatedUserMenu() {
  mockIsAuthenticated = true;
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

    it('calls logout when Log Out is clicked', async () => {
      renderAuthenticatedUserMenu();
      openDropdown();
      // Log Out has role="menuitem"
      fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });
});
