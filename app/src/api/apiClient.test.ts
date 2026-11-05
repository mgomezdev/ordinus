import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, ApiError, API_BASE_URL } from './apiClient';

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('prefixes the API base url and passes options through', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ data: 1 }), { status: 200 }));
    const result = await apiFetch<{ data: number }>('/things', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(result).toEqual({ data: 1 });
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/things`, expect.objectContaining({
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('returns undefined for 204 responses', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiFetch('/things/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws ApiError with the server message and status', async () => {
    stubFetch(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Layout not found' } }), { status: 404 }));
    const err = await apiFetch('/layouts/9').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'Layout not found', status: 404, name: 'ApiError' });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    stubFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(apiFetch('/x')).rejects.toMatchObject({
      message: 'Request failed with status 502',
      status: 502,
    });
  });
});
