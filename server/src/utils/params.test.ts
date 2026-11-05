import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { AppError } from '@gridfinity/shared';
import { parseIntParam } from './params.js';

const req = (params: Record<string, string>) => ({ params }) as unknown as Request;

describe('parseIntParam', () => {
  it('parses an integer param', () => {
    expect(parseIntParam(req({ id: '42' }), 'id')).toBe(42);
  });

  it('throws a validation error naming the label', () => {
    expect(() => parseIntParam(req({ id: 'abc' }), 'id', 'layout ID')).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR', message: 'Invalid layout ID' }) as AppError,
    );
  });

  it('defaults the label to the param name', () => {
    expect(() => parseIntParam(req({}), 'shareId')).toThrow('Invalid shareId');
  });
});
