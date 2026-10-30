import { apiFetch, API_BASE_URL } from './apiClient';
import type { CustomBinSpec } from '@gridfinity/shared';
import type { BinCustomization } from '../types/gridfinity';

export interface GenerateResponse {
  hash: string;
  status: 'pending' | 'complete' | 'failed';
}

export async function requestGenerationApi(
  libraryId: string,
  itemId: string,
  customization: BinCustomization | undefined,
): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>(
    '/generation/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryId, itemId, customization }),
    },
  );
}

export async function requestCustomGenerationApi(spec: CustomBinSpec): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>(
    '/generation/custom',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
    },
  );
}

export function generatedImageUrl(hash: string, filename: string): string {
  return `${API_BASE_URL}/generation/image/${hash}/${filename}`;
}

export interface GenerationStatusResponse {
  hash: string;
  status: 'pending' | 'complete' | 'failed' | 'not-found';
}

export async function getGenerationStatusApi(hash: string): Promise<GenerationStatusResponse> {
  return apiFetch<GenerationStatusResponse>(`/generation/status/${hash}`);
}
