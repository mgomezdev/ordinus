import type { ApiResponse, ApiBomSubmission } from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function bomFetch<T>(
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

export interface SubmitBomData {
  layoutId?: number;
  gridX: number;
  gridY: number;
  widthMm: number;
  depthMm: number;
  totalItems: number;
  totalUnique: number;
  exportJson: string;
}

export async function submitBom(
  data: SubmitBomData,
  accessToken?: string,
): Promise<ApiBomSubmission> {
  const result = await bomFetch<ApiResponse<ApiBomSubmission>>(
    '/bom/submit',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    accessToken,
  );
  return result.data;
}

export async function downloadBom(id: number, accessToken?: string): Promise<string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${API_BASE_URL}/bom/${id}/download`, { headers });
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }
  return response.text();
}
