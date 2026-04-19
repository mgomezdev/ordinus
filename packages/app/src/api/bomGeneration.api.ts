import type { ApiResponse, ApiBomGeneration } from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function genFetch<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function triggerBomGeneration(
  submissionId: number,
  accessToken?: string,
): Promise<ApiBomGeneration> {
  const result = await genFetch<ApiResponse<ApiBomGeneration>>(
    `/admin/bom/${submissionId}/generate`,
    { method: 'POST' },
    accessToken,
  );
  return result.data;
}

export async function getBomGeneration(
  submissionId: number,
  accessToken?: string,
): Promise<ApiBomGeneration | null> {
  try {
    const result = await genFetch<ApiResponse<ApiBomGeneration>>(
      `/admin/bom/${submissionId}/generation`,
      { method: 'GET' },
      accessToken,
    );
    return result.data;
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return null;
    throw err;
  }
}

export function getFileDownloadUrl(submissionId: number, filename: string): string {
  return `${API_BASE_URL}/admin/bom/${submissionId}/files/${encodeURIComponent(filename)}`;
}
