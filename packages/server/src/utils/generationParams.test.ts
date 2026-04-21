import { describe, it, expect } from 'vitest';
import { computeParamHash } from './generationParams.js';

describe('computeParamHash', () => {
  it('returns a 64-char hex sha256', () => {
    expect(computeParamHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is order-independent — same result for keys in any order', () => {
    const h1 = computeParamHash({ b: 2, a: 1 });
    const h2 = computeParamHash({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different values', () => {
    expect(computeParamHash({ a: 1 })).not.toBe(computeParamHash({ a: 2 }));
  });

  it('is stable across calls with identical input', () => {
    const params = { width: [2, 0], height: [4, 0], lip_style: 'normal' };
    expect(computeParamHash(params)).toBe(computeParamHash(params));
  });
});
