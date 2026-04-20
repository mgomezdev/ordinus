import { describe, it, expect } from 'vitest';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  WHEEL_ZOOM_FACTOR,
  ROTATION_CW,
  ROTATION_CCW,
} from './constants';
import { STORAGE_KEYS } from '../utils/storageKeys';

describe('Zoom constants', () => {
  it('should export MIN_ZOOM as 0.25', () => {
    expect(MIN_ZOOM).toBe(0.25);
  });

  it('should export MAX_ZOOM as 4.0', () => {
    expect(MAX_ZOOM).toBe(4.0);
  });

  it('should export ZOOM_STEP as 0.1', () => {
    expect(ZOOM_STEP).toBe(0.1);
  });

  it('should export WHEEL_ZOOM_FACTOR as 0.001', () => {
    expect(WHEEL_ZOOM_FACTOR).toBe(0.001);
  });

  it('should have MIN_ZOOM less than MAX_ZOOM', () => {
    expect(MIN_ZOOM).toBeLessThan(MAX_ZOOM);
  });

  it('should have ZOOM_STEP greater than 0', () => {
    expect(ZOOM_STEP).toBeGreaterThan(0);
  });
});

describe('ROTATION_CW', () => {
  it('should map 0 to 90', () => {
    expect(ROTATION_CW[0]).toBe(90);
  });

  it('should map 90 to 180', () => {
    expect(ROTATION_CW[90]).toBe(180);
  });

  it('should map 180 to 270', () => {
    expect(ROTATION_CW[180]).toBe(270);
  });

  it('should map 270 to 0', () => {
    expect(ROTATION_CW[270]).toBe(0);
  });
});

describe('ROTATION_CCW', () => {
  it('should map 0 to 270', () => {
    expect(ROTATION_CCW[0]).toBe(270);
  });

  it('should map 90 to 0', () => {
    expect(ROTATION_CCW[90]).toBe(0);
  });

  it('should map 180 to 90', () => {
    expect(ROTATION_CCW[180]).toBe(90);
  });

  it('should map 270 to 180', () => {
    expect(ROTATION_CCW[270]).toBe(180);
  });
});

it('STORAGE_KEYS includes WALKTHROUGH_SEEN', () => {
  expect(STORAGE_KEYS.WALKTHROUGH_SEEN).toBe('gridfinity-walkthrough-seen');
});
