import type { ApiUserStl, ApiUserStlAdmin } from '@gridfinity/shared';

const API_BASE = '/api/v1/user-stls';

async function apiFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const isMultipart = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
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

export async function fetchUserStls(token: string): Promise<ApiUserStl[]> {
  const res = await apiFetch(API_BASE, token);
  return res.json() as Promise<ApiUserStl[]>;
}

export async function uploadUserStl(file: File, name: string, token: string): Promise<ApiUserStl> {
  const form = new FormData();
  form.append('file', file);
  form.append('name', name);
  const res = await apiFetch(API_BASE, token, { method: 'POST', body: form });
  return res.json() as Promise<ApiUserStl>;
}

export async function updateUserStl(
  id: string,
  data: { name?: string; gridX?: number | null; gridY?: number | null },
  token: string,
): Promise<ApiUserStl> {
  const res = await apiFetch(`${API_BASE}/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.json() as Promise<ApiUserStl>;
}

export async function deleteUserStl(id: string, token: string): Promise<void> {
  await apiFetch(`${API_BASE}/${id}`, token, { method: 'DELETE' });
}

export async function reprocessUserStl(id: string, token: string): Promise<void> {
  await apiFetch(`${API_BASE}/${id}/reprocess`, token, { method: 'POST' });
}

export async function replaceUserStlFile(id: string, file: File, token: string): Promise<ApiUserStl> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`${API_BASE}/${id}/file`, token, { method: 'PUT', body: form });
  return res.json() as Promise<ApiUserStl>;
}

export function getUserStlImageUrl(id: string, filename: string): string {
  return `${API_BASE}/${id}/images/${encodeURIComponent(filename)}`;
}

export async function fetchAdminUserStls(token: string): Promise<ApiUserStlAdmin[]> {
  const res = await apiFetch('/api/v1/admin/user-stls', token);
  return res.json() as Promise<ApiUserStlAdmin[]>;
}

export async function promoteUserStl(id: string, token: string): Promise<void> {
  await apiFetch(`/api/v1/admin/user-stls/${id}/promote`, token, { method: 'POST' });
}
