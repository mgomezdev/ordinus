import { describe, it, expect } from 'vitest';
import { formatGapValue, formatAxisGap, formatGapPair } from './gapDisplay';

describe('gapDisplay', () => {
  describe('formatGapValue', () => {
    it('shows metric to one decimal place', () => {
      expect(formatGapValue(12.345, 'metric', 'decimal')).toBe('12.3');
      expect(formatGapValue(5, 'metric', 'fractional')).toBe('5.0');
    });

    it('rounds down so the gap never overstates the space', () => {
      expect(formatGapValue(2.98, 'metric', 'decimal')).toBe('2.9');
      expect(formatGapValue(2.999, 'metric', 'decimal')).toBe('2.9');
      expect(formatGapValue(0.99, 'imperial', 'fractional')).toBe('31/32');
      expect(formatGapValue(0.26, 'imperial', 'decimal')).toBe('0.2');
    });

    it('does not lose a step to floating point error', () => {
      expect(formatGapValue(0.1 + 0.2, 'metric', 'decimal')).toBe('0.3');
      expect(formatGapValue(0.5 - 1e-12, 'imperial', 'fractional')).toBe('1/2');
    });

    it('shows imperial decimal to one decimal place', () => {
      expect(formatGapValue(0.25, 'imperial', 'decimal')).toBe('0.2');
      expect(formatGapValue(1, 'imperial', 'decimal')).toBe('1.0');
    });

    it('shows zero gap', () => {
      expect(formatGapValue(0, 'metric', 'decimal')).toBe('0.0');
      expect(formatGapValue(0, 'imperial', 'fractional')).toBe('0');
    });

    it.each([
      [0.5, '1/2'],
      [0.25, '1/4'],
      [0.125, '1/8'],
      [0.0625, '1/16'],
      [0.03125, '1/32'],
      [0.34375, '11/32'],
      [0.36, '11/32'],
      [0.0312, '0'],
      [1.4375, '1 7/16'],
    ])('shows imperial fractional %s as %s', (value, expected) => {
      expect(formatGapValue(value, 'imperial', 'fractional')).toBe(expected);
    });
  });

  describe('formatAxisGap', () => {
    it('shows the full value for none', () => {
      expect(formatAxisGap(10, 'none', 'metric', 'decimal')).toBe('10.0');
    });

    it('shows the full value for one-sided', () => {
      expect(formatAxisGap(10, 'one-sided', 'metric', 'decimal')).toBe('10.0');
    });

    it('splits the value in half for symmetrical', () => {
      expect(formatAxisGap(10, 'symmetrical', 'metric', 'decimal')).toBe('5.0 + 5.0');
      expect(formatAxisGap(7, 'symmetrical', 'metric', 'decimal')).toBe('3.5 + 3.5');
    });

    it('splits fractional inches onto woodworking fractions', () => {
      expect(formatAxisGap(0.5, 'symmetrical', 'imperial', 'fractional')).toBe('1/4 + 1/4');
      expect(formatAxisGap(0.1875, 'symmetrical', 'imperial', 'fractional')).toBe('3/32 + 3/32');
      expect(formatAxisGap(0.2, 'symmetrical', 'imperial', 'fractional')).toBe('3/32 + 3/32');
    });

    it('splits imperial decimals to one decimal place', () => {
      expect(formatAxisGap(1, 'symmetrical', 'imperial', 'decimal')).toBe('0.5 + 0.5');
      expect(formatAxisGap(5.98, 'symmetrical', 'metric', 'decimal')).toBe('2.9 + 2.9');
    });
  });

  describe('formatGapPair', () => {
    const spacers = { horizontal: 'none', vertical: 'none' } as const;

    it('collapses equal axes into one value', () => {
      expect(formatGapPair(4, 4, spacers, 'metric', 'decimal')).toBe('4.0 mm');
    });

    it('shows width x depth when axes differ', () => {
      expect(formatGapPair(4, 6, spacers, 'metric', 'decimal')).toBe('4.0 x 6.0 mm');
    });

    it('applies each axis spacer mode independently', () => {
      const config = { horizontal: 'symmetrical', vertical: 'one-sided' } as const;
      expect(formatGapPair(4, 6, config, 'metric', 'decimal')).toBe('2.0 + 2.0 x 6.0 mm');
    });

    it('does not collapse when modes differ even if gaps are equal', () => {
      const config = { horizontal: 'symmetrical', vertical: 'none' } as const;
      expect(formatGapPair(4, 4, config, 'metric', 'decimal')).toBe('2.0 + 2.0 x 4.0 mm');
    });

    it('uses inch unit label for imperial', () => {
      expect(formatGapPair(0.5, 0.5, spacers, 'imperial', 'fractional')).toBe('1/2 in');
    });
  });
});
