export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export async function authenticatedFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, { ...options, credentials: 'include' });
  if (response.status === 401 && !String(input).includes('/auth/')) window.dispatchEvent(new Event('ordinus:auth-required'));
  return response;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const message =
      errorBody?.error?.message ?? `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
