import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestGenerationApi, generatedImageUrl } from './generation.api';

vi.mock('./apiClient', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3001/api/v1',
}));

import { apiFetch, API_BASE_URL } from './apiClient';
const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('requestGenerationApi', () => {
  it('POSTs to /generation/generate with correct body and token', async () => {
    mockApiFetch.mockResolvedValue({ hash: 'abc123', status: 'pending' });

    const result = await requestGenerationApi('lib-1', 'item-1', undefined, 'tok');

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/generation/generate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: 'lib-1', itemId: 'item-1', customization: undefined }),
      }),
      'tok',
    );
    expect(result).toEqual({ hash: 'abc123', status: 'pending' });
  });

  it('includes customization in the request body when provided', async () => {
    mockApiFetch.mockResolvedValue({ hash: 'def456', status: 'pending' });

    const customization = { wallPatternEnabled: true, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 4 };
    await requestGenerationApi('lib-1', 'item-1', customization, 'tok');

    const call = mockApiFetch.mock.calls[0];
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.customization).toEqual(customization);
  });

  it('returns complete status when already cached', async () => {
    mockApiFetch.mockResolvedValue({ hash: 'abc123', status: 'complete' });

    const result = await requestGenerationApi('lib-1', 'item-1', undefined, 'tok');
    expect(result.status).toBe('complete');
  });

  it('propagates errors from apiFetch', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    await expect(requestGenerationApi('lib-1', 'item-1', undefined, 'tok')).rejects.toThrow('Network error');
  });
});

describe('generatedImageUrl', () => {
  it('constructs URL from API_BASE_URL, hash, and filename', () => {
    const url = generatedImageUrl('abc123', 'ortho.png');
    expect(url).toBe(`${API_BASE_URL}/generation/image/abc123/ortho.png`);
  });

  it('works with all valid perspective filenames', () => {
    for (const filename of ['ortho.png', 'perspective_0.png', 'perspective_90.png', 'perspective_180.png', 'perspective_270.png']) {
      expect(generatedImageUrl('hash', filename)).toBe(`${API_BASE_URL}/generation/image/hash/${filename}`);
    }
  });
});
