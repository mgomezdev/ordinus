import { createHash } from 'crypto';

export function computeParamHash(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(params).sort((a, b) => a[0].localeCompare(b[0]))
    )
  );
  return createHash('sha256').update(canonical).digest('hex');
}
