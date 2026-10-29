/**
 * Four-point perspective (homography) helpers used to align a reference photo
 * to the grid: the user marks the grid's four corners on the photo and the
 * photo is warped so those points land on the grid corners.
 *
 * Coordinates are y-down (screen/image convention). Quads are ordered
 * top-left, top-right, bottom-right, bottom-left.
 */

export interface Point {
  x: number;
  y: number;
}

export type Quad = [Point, Point, Point, Point];

/** Row-major 3x3 matrix with h[8] normalised to 1. */
export type Homography = [number, number, number, number, number, number, number, number, number];

export interface QuadValidation {
  valid: boolean;
  convex: boolean;
  angles: [number, number, number, number];
  issues: string[];
}

export interface WarpBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_CORNER_ANGLE_DEG = 50;
export const MAX_CORNER_ANGLE_DEG = 135;
export const CORNER_LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'] as const;

export const UNIT_SQUARE: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const SINGULAR_EPSILON = 1e-12;

/** Solves A·x = b in place with Gaussian elimination and partial pivoting. */
function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < SINGULAR_EPSILON) {
      throw new Error('Degenerate quadrilateral: cannot compute perspective transform');
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];

    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k < n; k++) a[row][k] -= factor * a[col][k];
      b[row] -= factor * b[col];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) sum -= a[row][k] * x[k];
    x[row] = sum / a[row][row];
  }
  return x;
}

/** Homography mapping each `src` corner onto the matching `dst` corner. */
export function computeHomography(src: Quad, dst: Quad): Homography {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solveLinearSystem(a, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyHomography(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

/** Homogeneous weight of `p` under `h`; non-positive means beyond the horizon. */
export function homographyWeight(h: Homography, p: Point): number {
  return h[6] * p.x + h[7] * p.y + h[8];
}

export function invertHomography(h: Homography): Homography {
  const [a, b, c, d, e, f, g, i, j] = h;
  const co00 = e * j - f * i;
  const co01 = -(d * j - f * g);
  const co02 = d * i - e * g;
  const det = a * co00 + b * co01 + c * co02;
  if (Math.abs(det) < SINGULAR_EPSILON) {
    throw new Error('Homography is not invertible');
  }
  const inv: Homography = [
    co00, -(b * j - c * i), b * f - c * e,
    co01, a * j - c * g, -(a * f - c * d),
    co02, -(a * i - b * g), a * e - b * d,
  ];
  const scale = inv[8];
  return inv.map(v => v / scale) as Homography;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - a.y) - (a.y - o.y) * (b.x - a.x);
}

/** Interior angle (degrees) at each corner, in quad order. */
export function quadInteriorAngles(q: Quad): [number, number, number, number] {
  return q.map((p, i) => {
    const prev = q[(i + 3) % 4];
    const next = q[(i + 1) % 4];
    const ax = prev.x - p.x;
    const ay = prev.y - p.y;
    const bx = next.x - p.x;
    const by = next.y - p.y;
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (lengths === 0) return 0;
    const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / lengths));
    return (Math.acos(cos) * 180) / Math.PI;
  }) as [number, number, number, number];
}

/**
 * Checks the quad is convex, ordered TL→TR→BR→BL (clockwise on screen) and
 * every corner angle is within the supported range.
 */
export function validateQuad(q: Quad): QuadValidation {
  const turns = q.map((p, i) => cross(p, q[(i + 1) % 4], q[(i + 2) % 4]));
  const allPositive = turns.every(t => t > 0);
  const allNegative = turns.every(t => t < 0);
  const convex = allPositive || allNegative;
  const angles = quadInteriorAngles(q);
  const issues: string[] = [];

  if (!convex) {
    issues.push('Shape must be convex — edges cannot cross or bend inward.');
  } else if (allNegative) {
    issues.push('Corners are out of order — keep top-left, top-right, bottom-right, bottom-left going clockwise.');
  }

  angles.forEach((angle, i) => {
    if (angle < MIN_CORNER_ANGLE_DEG || angle > MAX_CORNER_ANGLE_DEG) {
      issues.push(
        `${CORNER_LABELS[i]} angle is ${Math.round(angle)}° — must be between ${MIN_CORNER_ANGLE_DEG}° and ${MAX_CORNER_ANGLE_DEG}°.`,
      );
    }
  });

  return { valid: issues.length === 0, convex, angles, issues };
}

/**
 * Extent (in grid units, grid = [0,1]²) covered by the whole warped image,
 * clamped to `maxOverflow` grid units beyond each grid edge.
 */
export function computeWarpBounds(
  srcToGrid: Homography,
  imageWidth: number,
  imageHeight: number,
  maxOverflow: number,
): WarpBounds {
  const clamp: WarpBounds = {
    minX: -maxOverflow,
    minY: -maxOverflow,
    maxX: 1 + maxOverflow,
    maxY: 1 + maxOverflow,
  };
  const imageCorners: Point[] = [
    { x: 0, y: 0 },
    { x: imageWidth, y: 0 },
    { x: imageWidth, y: imageHeight },
    { x: 0, y: imageHeight },
  ];
  // Part of the image lies beyond the vanishing line: it would extend to
  // infinity, so the clamp window is the extent.
  if (imageCorners.some(p => homographyWeight(srcToGrid, p) <= 0)) return clamp;

  const mapped = imageCorners.map(p => applyHomography(srcToGrid, p));
  return {
    minX: Math.max(clamp.minX, Math.min(0, ...mapped.map(p => p.x))),
    minY: Math.max(clamp.minY, Math.min(0, ...mapped.map(p => p.y))),
    maxX: Math.min(clamp.maxX, Math.max(1, ...mapped.map(p => p.x))),
    maxY: Math.min(clamp.maxY, Math.max(1, ...mapped.map(p => p.y))),
  };
}

/** Normalised (0–1) rectangle inset by `inset` on every side. */
export function defaultQuad(inset: number): Quad {
  const lo = inset;
  const hi = 1 - inset;
  return [
    { x: lo, y: lo },
    { x: hi, y: lo },
    { x: hi, y: hi },
    { x: lo, y: hi },
  ];
}
