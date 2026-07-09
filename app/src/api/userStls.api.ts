import type { ApiUserStl } from '@gridfinity/shared';

const API_BASE = '/api/v1/user-stls';

async function userStlFetch(path: string, init?: RequestInit): Promise<Response> {
  const isMultipart = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res;
}

export async function fetchUserStls(): Promise<ApiUserStl[]> {
  const res = await userStlFetch(API_BASE);
  return res.json() as Promise<ApiUserStl[]>;
}

export async function uploadUserStl(
  file: File,
  name: string,
  opts?: { gridX?: number; gridY?: number; gridZ?: number; visibility?: string },
): Promise<ApiUserStl> {
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  if (opts?.gridX != null) form.append('gridX', String(opts.gridX));
  if (opts?.gridY != null) form.append('gridY', String(opts.gridY));
  if (opts?.gridZ != null) form.append('gridZ', String(opts.gridZ));
  if (opts?.visibility) form.append('visibility', opts.visibility);
  const res = await userStlFetch(API_BASE, { method: 'POST', body: form });
  return res.json() as Promise<ApiUserStl>;
}

export async function fetchPublicUserStls(): Promise<ApiUserStl[]> {
  const res = await userStlFetch(`${API_BASE}/public`);
  return res.json() as Promise<ApiUserStl[]>;
}

export async function updateUserStl(
  id: string,
  data: { name?: string; gridX?: number | null; gridY?: number | null },
): Promise<ApiUserStl> {
  const res = await userStlFetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.json() as Promise<ApiUserStl>;
}

export async function deleteUserStl(id: string): Promise<void> {
  await userStlFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
}

export async function reprocessUserStl(id: string): Promise<void> {
  await userStlFetch(`${API_BASE}/${id}/reprocess`, { method: 'POST' });
}

export async function replaceUserStlFile(id: string, file: File): Promise<ApiUserStl> {
  const form = new FormData();
  form.append('file', file);
  const res = await userStlFetch(`${API_BASE}/${id}/file`, { method: 'PUT', body: form });
  return res.json() as Promise<ApiUserStl>;
}

export function getUserStlImageUrl(id: string, filename: string): string {
  return `${API_BASE}/${id}/images/${encodeURIComponent(filename)}`;
}
