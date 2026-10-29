import { describe, it, expect } from 'vitest';
import {
  computeHomography,
  applyHomography,
  invertHomography,
  quadInteriorAngles,
  validateQuad,
  computeWarpBounds,
  defaultQuad,
  UNIT_SQUARE,
  MIN_CORNER_ANGLE_DEG,
  MAX_CORNER_ANGLE_DEG,
} from './perspective.js';
import type { Quad, Point } from './perspective.js';

// Corners are TL, TR, BR, BL in y-down (screen/image) coordinates.
const NEAR_RECT: Quad = [
  { x: 52, y: 41 },
  { x: 351, y: 47 },
  { x: 347, y: 262 },
  { x: 48, y: 255 },
];

const TRAPEZOID: Quad = [
  { x: 120, y: 60 },
  { x: 280, y: 60 },
  { x: 360, y: 240 },
  { x: 40, y: 240 },
];

function expectPointClose(actual: Point, expected: Point, digits = 6) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

/** Intersection of the quad's diagonals (TL-BR and TR-BL). */
function diagonalIntersection(q: Quad): Point {
  const [a, b, c, d] = q;
  const r = { x: c.x - a.x, y: c.y - a.y };
  const s = { x: d.x - b.x, y: d.y - b.y };
  const denom = r.x * s.y - r.y * s.x;
  const t = ((b.x - a.x) * s.y - (b.y - a.y) * s.x) / denom;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

describe('computeHomography', () => {
  it('maps an axis-aligned rectangle to the unit square as a pure scale + translate', () => {
    const rect: Quad = [{ x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 70 }, { x: 10, y: 70 }];
    const h = computeHomography(rect, UNIT_SQUARE);
    expectPointClose(applyHomography(h, { x: 60, y: 45 }), { x: 0.5, y: 0.5 });
    expectPointClose(applyHomography(h, { x: 35, y: 32.5 }), { x: 0.25, y: 0.25 });
    // No perspective terms for an affine mapping
    expect(h[6]).toBeCloseTo(0, 9);
    expect(h[7]).toBeCloseTo(0, 9);
  });

  it.each([
    ['near-rectangular (minimal distortion)', NEAR_RECT],
    ['trapezoid', TRAPEZOID],
  ])('maps every %s corner onto the matching grid corner', (_label, quad) => {
    const h = computeHomography(quad, UNIT_SQUARE);
    quad.forEach((p, i) => expectPointClose(applyHomography(h, p), UNIT_SQUARE[i]));
  });

  it.each([
    ['near-rectangular', NEAR_RECT],
    ['trapezoid', TRAPEZOID],
  ])('maps the %s diagonal intersection to the grid centre (projective invariant)', (_label, quad) => {
    const h = computeHomography(quad, UNIT_SQUARE);
    expectPointClose(applyHomography(h, diagonalIntersection(quad)), { x: 0.5, y: 0.5 });
  });

  it('keeps distortion minimal for a near-rectangular quad', () => {
    const h = computeHomography(NEAR_RECT, UNIT_SQUARE);
    // Perspective terms are tiny compared with a trapezoid's
    const trap = computeHomography(TRAPEZOID, UNIT_SQUARE);
    expect(Math.abs(h[6]) + Math.abs(h[7])).toBeLessThan((Math.abs(trap[6]) + Math.abs(trap[7])) / 10);
  });

  it('throws for a degenerate quad', () => {
    const collapsed: Quad = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    expect(() => computeHomography(collapsed, UNIT_SQUARE)).toThrow();
  });
});

describe('invertHomography', () => {
  it('round-trips points through the trapezoid mapping', () => {
    const h = computeHomography(TRAPEZOID, UNIT_SQUARE);
    const inv = invertHomography(h);
    TRAPEZOID.forEach((p, i) => expectPointClose(applyHomography(inv, UNIT_SQUARE[i]), p, 4));
    const p = { x: 200, y: 150 };
    expectPointClose(applyHomography(inv, applyHomography(h, p)), p, 4);
  });
});

describe('quadInteriorAngles', () => {
  it('returns 90° everywhere for a rectangle', () => {
    const angles = quadInteriorAngles([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }]);
    angles.forEach(a => expect(a).toBeCloseTo(90, 6));
  });

  it('returns angles summing to 360° for a trapezoid', () => {
    const angles = quadInteriorAngles(TRAPEZOID);
    expect(angles.reduce((s, a) => s + a, 0)).toBeCloseTo(360, 6);
    expect(angles[0]).toBeGreaterThan(90);
    expect(angles[3]).toBeLessThan(90);
  });
});

describe('validateQuad', () => {
  it('accepts a near-rectangular quad', () => {
    const result = validateQuad(NEAR_RECT);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts a trapezoid within the angle limits', () => {
    const result = validateQuad(TRAPEZOID);
    expect(result.valid).toBe(true);
    result.angles.forEach(a => {
      expect(a).toBeGreaterThanOrEqual(MIN_CORNER_ANGLE_DEG);
      expect(a).toBeLessThanOrEqual(MAX_CORNER_ANGLE_DEG);
    });
  });

  it('rejects a trapezoid whose base angles are sharper than the minimum', () => {
    const steep: Quad = [{ x: 180, y: 0 }, { x: 220, y: 0 }, { x: 400, y: 100 }, { x: 0, y: 100 }];
    const result = validateQuad(steep);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/50°/);
  });

  it('rejects a non-convex (bow-tie) quad', () => {
    const bowtie: Quad = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    const result = validateQuad(bowtie);
    expect(result.valid).toBe(false);
    expect(result.convex).toBe(false);
  });

  it('rejects corners given in mirrored order', () => {
    const mirrored: Quad = [NEAR_RECT[1], NEAR_RECT[0], NEAR_RECT[3], NEAR_RECT[2]];
    const result = validateQuad(mirrored);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/order/i);
  });
});

describe('computeWarpBounds', () => {
  it('extends past the grid when the image is larger than the marked quad', () => {
    // Image 400x300, quad inset by 10% on every side → overflow of 12.5% per side
    const quad: Quad = [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }];
    const h = computeHomography(quad, UNIT_SQUARE);
    const b = computeWarpBounds(h, 400, 300, 0.5);
    expect(b.minX).toBeCloseTo(-0.125, 6);
    expect(b.maxX).toBeCloseTo(1.125, 6);
    expect(b.minY).toBeCloseTo(-0.125, 6);
    expect(b.maxY).toBeCloseTo(1.125, 6);
  });

  it('clamps overflow to the configured maximum for a strong trapezoid', () => {
    const h = computeHomography(TRAPEZOID, UNIT_SQUARE);
    const b = computeWarpBounds(h, 400, 300, 0.5);
    expect(b.minX).toBeGreaterThanOrEqual(-0.5);
    expect(b.maxX).toBeLessThanOrEqual(1.5);
    expect(b.minY).toBeGreaterThanOrEqual(-0.5);
    expect(b.maxY).toBeLessThanOrEqual(1.5);
    // Grid itself is always fully covered
    expect(b.minX).toBeLessThanOrEqual(0);
    expect(b.maxX).toBeGreaterThanOrEqual(1);
  });
});

describe('defaultQuad', () => {
  it('produces a valid inset rectangle', () => {
    const q = defaultQuad(0.1);
    expectPointClose(q[0], { x: 0.1, y: 0.1 });
    expectPointClose(q[2], { x: 0.9, y: 0.9 });
    expect(validateQuad(q).valid).toBe(true);
  });
});
