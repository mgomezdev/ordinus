export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

/**
 * Shared error-handling fetch wrapper used by the authenticated API modules.
 *
 * - Merges the caller-supplied headers with an optional Authorization header.
 * - Throws an Error with the server's `error.message` on non-OK responses.
 * - Returns `undefined as T` for 204 No Content.
 * - Returns `response.json()` otherwise.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const authHeader: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...authHeader,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const message =
      errorBody?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
