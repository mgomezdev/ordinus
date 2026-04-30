import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { ApiUser } from '@gridfinity/shared';
import {
  loginApi,
  registerApi,
  refreshTokenApi,
  logoutApi,
  getMeApi,
} from '../api/auth.api';

const REFRESH_TOKEN_KEY = 'gridfinity_refresh_token';

function hasStoredRefreshToken(): boolean {
  return localStorage.getItem(REFRESH_TOKEN_KEY) !== null;
}

interface AuthContextValue {
  user: ApiUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<ApiUser | null>(null);
  // Only loading if there's a stored refresh token to try
  const [isLoading, setIsLoading] = useState(hasStoredRefreshToken);
  const accessTokenRef = useRef<string | null>(null);

  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    accessTokenRef.current = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }, []);

  // Guard against StrictMode double-invocation: with refresh token rotation,
  // two concurrent calls with the same token triggers reuse detection and
  // revokes the entire token family.
  const hasStartedRefreshRef = useRef(false);

  // Attempt silent refresh on mount
  useEffect(() => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken || hasStartedRefreshRef.current) {
      return;
    }
    hasStartedRefreshRef.current = true;

    refreshTokenApi(storedRefreshToken)
      .then(async (tokens) => {
        accessTokenRef.current = tokens.accessToken;
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);

        const me = await getMeApi(tokens.accessToken);
        setUser(me);
      })
      .catch(() => {
        clearAuth();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginApi(email, password);
    accessTokenRef.current = result.accessToken;
    localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    setUser(result.user);
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    const result = await registerApi(email, username, password);
    accessTokenRef.current = result.accessToken;
    localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    const token = accessTokenRef.current;
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    clearAuth();

    // Best-effort logout on server
    if (token && refreshToken) {
      try {
        await logoutApi(token, refreshToken);
      } catch {
        // Ignore errors during logout
      }
    }
  }, [clearAuth]);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    register,
    logout,
    getAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
