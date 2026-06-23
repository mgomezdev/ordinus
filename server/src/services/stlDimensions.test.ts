import { describe, it, expect } from 'vitest';
import { validateStlDimensions } from './stlDimensions.js';

// Builds a minimal binary STL with one triangle whose three vertices sit at
// (0,0,0), (x,0,0), (0,y,0) — enough for the parser to derive bounding-box dims.
function makeBuf(x: number, y: number, z: number): Buffer {
  const buf = Buffer.alloc(84 + 50); // header(80) + count(4) + 1 triangle(50)
  buf.writeUInt32LE(1, 80); // triangle count
  const base = 84 + 12; // skip normal (12 bytes)
  // vertex 0: (0, 0, 0)
  buf.writeFloatLE(0, base);
  buf.writeFloatLE(0, base + 4);
  buf.writeFloatLE(0, base + 8);
  // vertex 1: (x, 0, 0)
  buf.writeFloatLE(x, base + 12);
  buf.writeFloatLE(0, base + 16);
  buf.writeFloatLE(0, base + 20);
  // vertex 2: (0, y, z)
  buf.writeFloatLE(0, base + 24);
  buf.writeFloatLE(y, base + 28);
  buf.writeFloatLE(z, base + 32);
  return buf;
}

describe('validateStlDimensions', () => {
  // 2×4×6 bin → 84mm × 168mm × 42mm (6 height units × 7mm each)
  it('accepts a valid 2×4×6 bin', () => {
    const buf = makeBuf(84, 168, 42);
    expect(validateStlDimensions(buf, 2, 4, 6)).toBeNull();
  });

  it('returns mismatch error when width is wrong', () => {
    const buf = makeBuf(50, 168, 42); // 50mm instead of 84mm
    const result = validateStlDimensions(buf, 2, 4, 6);
    expect(result).toMatch(/mismatch/i);
  });

  it('accepts any orientation — swapping X/Y/Z axes still passes', () => {
    // Swap axes: z→x, x→y, y→z
    const buf = makeBuf(42, 84, 168);
    expect(validateStlDimensions(buf, 2, 4, 6)).toBeNull();
  });

  it('returns parse error for buffer that is too small', () => {
    const tiny = Buffer.alloc(10);
    const result = validateStlDimensions(tiny, 1, 1, 1);
    expect(result).toMatch(/parse|format/i);
  });

  it('accepts dimensions exactly 5mm off (at tolerance boundary)', () => {
    // 84mm + 5mm = 89mm — exactly at the limit → should pass
    const buf = makeBuf(89, 168, 42);
    expect(validateStlDimensions(buf, 2, 4, 6)).toBeNull();
  });

  it('rejects dimensions 5.1mm off (just beyond tolerance)', () => {
    // 84mm + 5.1mm = 89.1mm — just over the limit → should fail
    const buf = makeBuf(89.1, 168, 42);
    const result = validateStlDimensions(buf, 2, 4, 6);
    expect(result).toMatch(/mismatch/i);
  });
});
