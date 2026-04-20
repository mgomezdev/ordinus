import type { ApiResponse, AuthResponse, TokenResponse, ApiUser } from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function loginApi(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const result = await authFetch<ApiResponse<AuthResponse>>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return result.data;
}

export async function registerApi(
  email: string,
  username: string,
  password: string,
): Promise<AuthResponse> {
  const result = await authFetch<ApiResponse<AuthResponse>>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
  });
  return result.data;
}

export async function refreshTokenApi(
  refreshToken: string,
): Promise<TokenResponse> {
  const result = await authFetch<ApiResponse<TokenResponse>>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  return result.data;
}

export async function logoutApi(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  await authFetch<void>('/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ refreshToken }),
  });
}

export async function getMeApi(accessToken: string): Promise<ApiUser> {
  const result = await authFetch<ApiResponse<ApiUser>>('/auth/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return result.data;
}

export async function updateMeApi(
  accessToken: string,
  updates: { username?: string; email?: string },
): Promise<ApiUser> {
  const result = await authFetch<ApiResponse<ApiUser>>('/auth/me', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(updates),
  });
  return result.data;
}

export async function changePasswordApi(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await authFetch<void>('/auth/change-password', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
