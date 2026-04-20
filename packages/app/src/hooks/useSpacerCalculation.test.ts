import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSpacerCalculation } from './useSpacerCalculation';
import type { GridSpacerConfig } from '../types/gridfinity';

describe('useSpacerCalculation', () => {
  describe('zero gap scenarios', () => {
    it('should return empty array when both gaps are zero', () => {
      const config: GridSpacerConfig = { horizontal: 'one-sided', vertical: 'one-sided' };
      const { result } = renderHook(() =>
        useSpacerCalculation(0, 0, config, 168, 168)
      );
      expect(result.current).toEqual([]);
    });

    it('should return empty array when horizontal gap is zero but vertical is set', () => {
      const config: GridSpacerConfig = { horizontal: 'one-sided', vertical: 'none' };
      const { result } = renderHook(() =>
        useSpacerCalculation(0, 2, config, 168, 170)
      );
      expect(result.current).toEqual([]);
    });
  });

  describe('none mode', () => {
    it('should return empty array when both modes are none', () => {
      const config: GridSpacerConfig = { horizontal: 'none', vertical: 'none' };
      const { result } = renderHook(() =>
        useSpacerCalculation(2, 2, config, 170, 170)
      );
      expect(result.current).toEqual([]);
    });

    it('should only return horizontal spacer when vertical is none', () => {
      const config: GridSpacerConfig = { horizontal: 'one-sided', vertical: 'none' };
      const { result } = renderHook(() =>
        useSpacerCalculation(2, 2, config, 170, 170)
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].position).toBe('left');
    });

    it('should only return vertical spacer when horizontal is none', () => {
      const config: GridSpacerConfig = { horizontal: 'none', vertical: 'one-sided' };
      const { result } = renderHook(() =>
        useSpacerCalculation(2, 2, config, 170, 170)
      );
      expect(result.current).toHaveLength(1);
      expect(result.current[0].position).toBe('top');
    });
  });

  describe('one-sided mode', () => {
    it('should create left spacer for horizontal one-sided', () => {
      const config: GridSpacerConfig = { horizontal: 'one-sided', vertical: 'none' };
      const { result } = renderHook(() =>
        useSpacerCalculation(2, 0, config, 170, 168)
      );

      expect(result.current).toHaveLength(1);
      const spacer = result.current[0];
      expect(spacer.id).toBe('spacer-left');
      expect(spacer.position).toBe('left');
      expect(spacer.size).toBe(2);
      expect(spacer.renderX).toBe(0);
      expect(spacer.renderY).toBe(0);
      expect(spacer.renderWidth).toBeCloseTo((2 / 170) * 100);
      expect(spacer.renderHeight).toBe(100);
    });

    it('should create top spacer for vertical one-sided', () => {
      const config: GridSpacerConfig = { horizontal: 'none', vertical: 'one-sided' };
      const { result } = renderHook(() =>
        useSpacerCalculation(0, 2, config, 168, 170)
      );

      expect(result.current).toHaveLength(1);
      const spacer = result.current[0];
      expect(spacer.id).toBe('spacer-top');
      expect(spacer.position).toBe('top');
      expect(spacer.size).toBe(2);
      expect(spacer.renderX).toBe(0);
      expect(spacer.renderY).toBe(0);
      expect(spacer.renderWidth).toBe(100);
      expect(spacer.renderHeight).toBeCloseTo((2 / 170) * 100);
    });

    it('should create both left and top spacers when both are one-sided', () => {
      const config: GridSpacerConfig = { horizontal: 'one-sided', vertical: 'one-sided' };
      const { result } = renderHook(() =>
        useSpacerCalculation(2, 2, config, 170, 170)
      );

      expect(result.current).toHaveLength(2);
      expect(result.current.find(s => s.position === 'left')).toBeDefined();
      expect(result.current.find(s => s.position === 'top')).toBeDefined();
    });
  });

  describe('symmetrical mode', () => {
    it('should create left and right spacers for horizontal symmetrical', () => {
      const config: GridSpacerConfig = { horizontal: 'symmetrical', vertical: 'none' };
      const { result } = renderHook(() =>
        useSpacerCalculation(2, 0, config, 170, 168)
      );

      expect(result.current).toHaveLength(2);

      const leftSpacer = result.current.find(s => s.position === 'left');
      expect(leftSpacer).toBeDefined();
      expect(leftSpacer?.size).toBe(1);
      expect(leftSpacer?.renderX).toBe(0);
      expect(leftSpacer?.renderWidth).toBeCloseTo((1 / 170) * 100);

      const rightSpacer = result.current.find(s => s.position === 'right');
      expect(rightSpacer).toBeDefined();
      expect(rightSpacer?.size).toBe(1);
      expect(rightSpacer?.renderX).toBeCloseTo((169 / 170) * 100);
      expect(rightSpacer?.renderWidth).toBeCloseTo((1 / 170) * 100);
    });

    it('should create top and bottom spacers for vertical symmetrical', () => {
      const config: GridSpacerConfig = { horizontal: 'none', vertical: 'symmetrical' };
      const { result } = renderHook(() =>
        useSpacerCalculation(0, 2, config, 168, 170)
      );

      expect(result.current).toHaveLength(2);

      const topSpacer = result.current.find(s => s.position === 'top');
      expect(topSpacer).toBeDefined();
      expect(topSpacer?.size).toBe(1);
      expect(topSpacer?.renderY).toBe(0);
      expect(topSpacer?.renderHeight).toBeCloseTo((1 / 170) * 100);

      const bottomSpacer = result.current.find(s => s.position === 'bottom');
      expect(bottomSpacer).toBeDefined();
      expect(bottomSpacer?.size).toBe(1);
      expect(bottomSpacer?.renderY).toBeCloseTo((169 / 170) * 100);
      expect(bottomSpacer?.renderHeight).toBeCloseTo((1 / 170) * 100);
    });

    it('should create all four spacers when both are symmetrical', () => {
      const config: GridSpacerConfig = { horizontal: 'symmetrical', vertical: 'symmetrical' };
      const { result } = renderHook(() =>
        useSpacerCalculation(2, 2, config, 170, 170)
      );

      expect(result.current).toHaveLength(4);
      expect(result.current.find(s => s.position === 'left')).toBeDefined();
      expect(result.current.find(s => s.position === 'right')).toBeDefined();
      expect(result.current.find(s => s.position === 'top')).toBeDefined();
      expect(result.current.find(s => s.position === 'bottom')).toBeDefined();
    });
  });

  describe('large gap scenarios', () => {
    it('should handle large gaps correctly', () => {
      const config: GridSpacerConfig = { horizontal: 'symmetrical', vertical: 'symmetrical' };
      const { result } = renderHook(() =>
        useSpacerCalculation(32, 32, config, 200, 200)
      );

      expect(result.current).toHaveLength(4);

      const leftSpacer = result.current.find(s => s.position === 'left');
      expect(leftSpacer?.size).toBe(16);
      expect(leftSpacer?.renderWidth).toBeCloseTo((16 / 200) * 100);
    });
  });

  describe('memoization', () => {
    it('should return same reference when inputs do not change', () => {
      const config: GridSpacerConfig = { horizontal: 'one-sided', vertical: 'one-sided' };
      const { result, rerender } = renderHook(() =>
        useSpacerCalculation(2, 2, config, 170, 170)
      );

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      expect(firstResult).toBe(secondResult);
    });
  });
});
