import { describe, it, expect } from 'vitest';
import type { Quad } from '@gridfinity/shared';
import { warpPixels, WARP_MAX_OVERFLOW } from './refImageWarp.service.js';

const SRC_W = 400;
const SRC_H = 300;

/**
 * RGBA image whose red channel encodes x and green encodes y, so any output
 * pixel tells us which source location it was sampled from.
 */
function coordinateImage(): { data: Uint8Array; width: number; height: number } {
  const data = new Uint8Array(SRC_W * SRC_H * 4);
  for (let y = 0; y < SRC_H; y++) {
    for (let x = 0; x < SRC_W; x++) {
      const i = (y * SRC_W + x) * 4;
      data[i] = Math.round(((x + 0.5) / SRC_W) * 255);
      data[i + 1] = Math.round(((y + 0.5) / SRC_H) * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { data, width: SRC_W, height: SRC_H };
}

/** Source location (in normalised 0–1 image coords) encoded at grid point (u, v). */
function sampledSourceAt(
  out: ReturnType<typeof warpPixels>,
  u: number,
  v: number,
): { x: number; y: number; alpha: number } {
  const { bounds, width, height, data } = out;
  const px = Math.min(width - 1, Math.max(0, Math.floor(((u - bounds.minX) / (bounds.maxX - bounds.minX)) * width)));
  const py = Math.min(height - 1, Math.max(0, Math.floor(((v - bounds.minY) / (bounds.maxY - bounds.minY)) * height)));
  const i = (py * width + px) * 4;
  return { x: data[i] / 255, y: data[i + 1] / 255, alpha: data[i + 3] };
}

function toPx(q: Quad): Quad {
  return q.map(p => ({ x: p.x * SRC_W, y: p.y * SRC_H })) as Quad;
}

// Normalised corners on the source photo (TL, TR, BR, BL)
const NEAR_RECT: Quad = [
  { x: 0.13, y: 0.14 },
  { x: 0.88, y: 0.15 },
  { x: 0.87, y: 0.86 },
  { x: 0.12, y: 0.85 },
];

// Drawer photographed from the front: far edge appears narrower
const TRAPEZOID: Quad = [
  { x: 0.3, y: 0.2 },
  { x: 0.7, y: 0.2 },
  { x: 0.9, y: 0.8 },
  { x: 0.1, y: 0.8 },
];

const TOLERANCE = 0.02; // ~1 output pixel + 8-bit quantisation

describe('warpPixels', () => {
  it.each([
    ['near-rectangular (minimal distortion)', NEAR_RECT],
    ['trapezoid', TRAPEZOID],
  ])('moves each marked %s corner onto the grid corner', (_label, corners) => {
    const out = warpPixels(coordinateImage(), toPx(corners), 1, 200);
    const gridCorners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    gridCorners.forEach(([u, v], i) => {
      // Sample just inside the grid corner
      const s = sampledSourceAt(out, u === 0 ? 0.005 : 0.995, v === 0 ? 0.005 : 0.995);
      expect(s.alpha).toBe(255);
      expect(Math.abs(s.x - corners[i].x)).toBeLessThan(TOLERANCE);
      expect(Math.abs(s.y - corners[i].y)).toBeLessThan(TOLERANCE);
    });
  });

  it('samples the trapezoid diagonal intersection at the grid centre', () => {
    const out = warpPixels(coordinateImage(), toPx(TRAPEZOID), 1, 200);
    // Diagonals TL-BR and TR-BL of the trapezoid cross a third of the way down: (0.5, 0.4)
    const s = sampledSourceAt(out, 0.5, 0.5);
    expect(Math.abs(s.x - 0.5)).toBeLessThan(TOLERANCE);
    expect(Math.abs(s.y - 0.4)).toBeLessThan(TOLERANCE);
  });

  it('keeps a near-rectangle almost linear (grid midpoint ≈ quad midpoint)', () => {
    const out = warpPixels(coordinateImage(), toPx(NEAR_RECT), 1, 200);
    const s = sampledSourceAt(out, 0.5, 0.5);
    const avgX = NEAR_RECT.reduce((sum, p) => sum + p.x, 0) / 4;
    const avgY = NEAR_RECT.reduce((sum, p) => sum + p.y, 0) / 4;
    expect(Math.abs(s.x - avgX)).toBeLessThan(TOLERANCE);
    expect(Math.abs(s.y - avgY)).toBeLessThan(TOLERANCE);
  });

  it('keeps image content that overflows beyond the grid', () => {
    const out = warpPixels(coordinateImage(), toPx(NEAR_RECT), 1, 200);
    expect(out.bounds.minX).toBeLessThan(0);
    expect(out.bounds.minY).toBeLessThan(0);
    expect(out.bounds.maxX).toBeGreaterThan(1);
    expect(out.bounds.maxY).toBeGreaterThan(1);
    // Left of the grid still shows the photo
    const s = sampledSourceAt(out, -0.05, 0.5);
    expect(s.alpha).toBe(255);
    expect(s.x).toBeLessThan(NEAR_RECT[0].x);
  });

  it('leaves areas outside the photo transparent and clamps overflow', () => {
    const out = warpPixels(coordinateImage(), toPx(TRAPEZOID), 1, 200);
    expect(out.bounds.minX).toBeGreaterThanOrEqual(-WARP_MAX_OVERFLOW);
    expect(out.bounds.maxX).toBeLessThanOrEqual(1 + WARP_MAX_OVERFLOW);
    // The photo's bottom edge only spans ~-0.04..1.04 grid widths, so the
    // output's bottom-left corner lies outside the photo
    const s = sampledSourceAt(out, out.bounds.minX + 0.001, out.bounds.maxY - 0.001);
    expect(s.alpha).toBe(0);
  });

  it('sizes the output so the grid region honours the aspect ratio', () => {
    const out = warpPixels(coordinateImage(), toPx(NEAR_RECT), 2, 200);
    const gridPxW = out.width / (out.bounds.maxX - out.bounds.minX);
    const gridPxH = out.height / (out.bounds.maxY - out.bounds.minY);
    expect(gridPxW / gridPxH).toBeCloseTo(2, 1);
    expect(Math.max(gridPxW, gridPxH)).toBeCloseTo(200, -1);
  });
});
