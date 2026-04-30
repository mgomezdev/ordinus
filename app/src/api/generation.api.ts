import { apiFetch, API_BASE_URL } from './apiClient';
import type { BinCustomization } from '../types/gridfinity';

export interface GenerateResponse {
  hash: string;
  status: 'pending' | 'complete' | 'failed';
}

export async function requestGenerationApi(
  libraryId: string,
  itemId: string,
  customization: BinCustomization | undefined,
  accessToken: string,
): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>(
    '/generation/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryId, itemId, customization }),
    },
    accessToken,
  );
}

export function generatedImageUrl(hash: string, filename: string): string {
  return `${API_BASE_URL}/generation/image/${hash}/${filename}`;
}
