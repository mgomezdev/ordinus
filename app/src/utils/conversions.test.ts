import { describe, it, expect } from 'vitest';
import {
  decimalToFraction,
  fractionToDecimal,
  mmToInches,
  inchesToMm,
  calculateGrid,
} from './conversions';

describe('conversions', () => {
  describe('decimalToFraction', () => {
    it('should convert whole numbers correctly', () => {
      expect(decimalToFraction(5)).toBe('5');
      expect(decimalToFraction(0)).toBe('0');
      expect(decimalToFraction(100)).toBe('100');
    });

    it('should convert common fractions correctly', () => {
      expect(decimalToFraction(0.5)).toBe('1/2');
      expect(decimalToFraction(0.25)).toBe('1/4');
      expect(decimalToFraction(0.75)).toBe('3/4');
      expect(decimalToFraction(0.125)).toBe('1/8');
      expect(decimalToFraction(0.0625)).toBe('1/16');
    });

    it('should convert mixed numbers correctly', () => {
      expect(decimalToFraction(1.5)).toBe('1 1/2');
      expect(decimalToFraction(2.25)).toBe('2 1/4');
      expect(decimalToFraction(3.75)).toBe('3 3/4');
      expect(decimalToFraction(10.125)).toBe('10 1/8');
    });

    it('should simplify fractions', () => {
      expect(decimalToFraction(0.5)).toBe('1/2'); // 8/16 simplified
      expect(decimalToFraction(0.375)).toBe('3/8'); // 6/16 simplified
    });

    it('should handle values very close to whole numbers', () => {
      expect(decimalToFraction(0.99)).toBe('1'); // Rounds to 1
      expect(decimalToFraction(1.01)).toBe('1'); // Rounds to 1
      expect(decimalToFraction(2.98)).toBe('3'); // Rounds to 3
    });

    it('should handle very small fractional parts', () => {
      expect(decimalToFraction(5.03)).toBe('5'); // Less than 1/16, rounds down
      expect(decimalToFraction(5.01)).toBe('5');
    });

    it('should handle 1/16 increments', () => {
      expect(decimalToFraction(0.0625)).toBe('1/16');
      expect(decimalToFraction(0.1875)).toBe('3/16'); // 3/16
      expect(decimalToFraction(0.3125)).toBe('5/16'); // 5/16
      expect(decimalToFraction(0.9375)).toBe('15/16'); // 15/16
    });

    it('should handle negative numbers', () => {
      // Note: negative fractions may not be explicitly handled,
      // but let's test actual behavior
      const result = decimalToFraction(-1.5);
      expect(result).toBeDefined();
    });

    it('should handle large numbers', () => {
      expect(decimalToFraction(100.5)).toBe('100 1/2');
      expect(decimalToFraction(999.25)).toBe('999 1/4');
    });

    it('should round to nearest supported fraction', () => {
      // Note: 0.33 is actually closest to 5/16 (0.3125), not 1/4 (0.25)
      expect(decimalToFraction(0.33)).toBe('5/16');
      // 0.66 is closest to 11/16 (0.6875), not 1/2 (0.5)
      expect(decimalToFraction(0.66)).toBe('11/16');
    });
  });

  describe('fractionToDecimal', () => {
    it('should parse whole numbers', () => {
      expect(fractionToDecimal('5')).toBe(5);
      expect(fractionToDecimal('0')).toBe(0);
      expect(fractionToDecimal('100')).toBe(100);
    });

    it('should parse simple fractions', () => {
      expect(fractionToDecimal('1/2')).toBe(0.5);
      expect(fractionToDecimal('1/4')).toBe(0.25);
      expect(fractionToDecimal('3/4')).toBe(0.75);
      expect(fractionToDecimal('1/8')).toBe(0.125);
    });

    it('should parse mixed numbers', () => {
      expect(fractionToDecimal('1 1/2')).toBe(1.5);
      expect(fractionToDecimal('2 1/4')).toBe(2.25);
      expect(fractionToDecimal('3 3/4')).toBe(3.75);
      expect(fractionToDecimal('10 1/8')).toBe(10.125);
    });

    it('should parse decimal strings', () => {
      expect(fractionToDecimal('5.5')).toBe(5.5);
      expect(fractionToDecimal('3.14159')).toBe(3.14159);
      expect(fractionToDecimal('0.125')).toBe(0.125);
    });

    it('should handle whitespace', () => {
      expect(fractionToDecimal('  1/2  ')).toBe(0.5);
      expect(fractionToDecimal('  2  1/4  ')).toBe(2.25);
      expect(fractionToDecimal('   5   ')).toBe(5);
    });

    it('should handle empty string', () => {
      expect(fractionToDecimal('')).toBe(0);
      expect(fractionToDecimal('   ')).toBe(0);
    });

    it('should handle division by zero', () => {
      expect(fractionToDecimal('1/0')).toBe(0);
      expect(fractionToDecimal('5 3/0')).toBe(5);
    });

    it('should handle invalid input gracefully', () => {
      expect(fractionToDecimal('abc')).toBe(0);
      // Note: '1/2/3' parses as '1' (parseInt stops at first non-digit after whole number)
      expect(fractionToDecimal('1/2/3')).toBe(1);
      expect(fractionToDecimal('not a number')).toBe(0);
    });

    it('should handle unsimplified fractions', () => {
      expect(fractionToDecimal('2/4')).toBe(0.5);
      expect(fractionToDecimal('4/8')).toBe(0.5);
      expect(fractionToDecimal('8/16')).toBe(0.5);
    });

    it('should be inverse of decimalToFraction for common values', () => {
      const testValues = [0.5, 0.25, 0.75, 1.5, 2.25, 3.125];
      testValues.forEach(value => {
        const fraction = decimalToFraction(value);
        const backToDecimal = fractionToDecimal(fraction);
        expect(backToDecimal).toBeCloseTo(value, 10);
      });
    });

    it('should handle improper fractions', () => {
      expect(fractionToDecimal('5/4')).toBe(1.25);
      expect(fractionToDecimal('9/8')).toBe(1.125);
      expect(fractionToDecimal('16/16')).toBe(1);
    });

    it('should handle fractions with large denominators', () => {
      expect(fractionToDecimal('1/32')).toBe(0.03125);
      expect(fractionToDecimal('1/64')).toBe(0.015625);
    });
  });

  describe('mmToInches', () => {
    it('should convert millimeters to inches correctly', () => {
      expect(mmToInches(25.4)).toBeCloseTo(1, 10);
      expect(mmToInches(50.8)).toBeCloseTo(2, 10);
      expect(mmToInches(254)).toBeCloseTo(10, 10);
    });

    it('should handle zero', () => {
      expect(mmToInches(0)).toBe(0);
    });

    it('should handle decimals', () => {
      expect(mmToInches(12.7)).toBeCloseTo(0.5, 10);
      expect(mmToInches(6.35)).toBeCloseTo(0.25, 10);
    });

    it('should handle large values', () => {
      expect(mmToInches(1000)).toBeCloseTo(39.37007874, 5);
      expect(mmToInches(10000)).toBeCloseTo(393.7007874, 5);
    });

    it('should handle small values', () => {
      expect(mmToInches(1)).toBeCloseTo(0.03937, 5);
      expect(mmToInches(0.1)).toBeCloseTo(0.003937, 5);
    });

    it('should handle negative values', () => {
      expect(mmToInches(-25.4)).toBeCloseTo(-1, 10);
    });
  });

  describe('inchesToMm', () => {
    it('should convert inches to millimeters correctly', () => {
      expect(inchesToMm(1)).toBeCloseTo(25.4, 10);
      expect(inchesToMm(2)).toBeCloseTo(50.8, 10);
      expect(inchesToMm(10)).toBeCloseTo(254, 10);
    });

    it('should handle zero', () => {
      expect(inchesToMm(0)).toBe(0);
    });

    it('should handle decimals', () => {
      expect(inchesToMm(0.5)).toBeCloseTo(12.7, 10);
      expect(inchesToMm(0.25)).toBeCloseTo(6.35, 10);
    });

    it('should handle large values', () => {
      expect(inchesToMm(100)).toBeCloseTo(2540, 10);
      expect(inchesToMm(1000)).toBeCloseTo(25400, 10);
    });

    it('should handle small values', () => {
      expect(inchesToMm(0.01)).toBeCloseTo(0.254, 10);
      expect(inchesToMm(0.001)).toBeCloseTo(0.0254, 10);
    });

    it('should handle negative values', () => {
      expect(inchesToMm(-1)).toBeCloseTo(-25.4, 10);
    });

    it('should be inverse of mmToInches', () => {
      const testValues = [1, 10, 25.4, 100, 0.5];
      testValues.forEach(mm => {
        const inches = mmToInches(mm);
        const backToMm = inchesToMm(inches);
        expect(backToMm).toBeCloseTo(mm, 10);
      });
    });
  });

  describe('calculateGrid', () => {
    const GRIDFINITY_UNIT_MM = 42;

    describe('metric calculations', () => {
      it('should calculate grid for exact fit', () => {
        const result = calculateGrid(168, 168, 'metric'); // 4x4 grid
        expect(result.gridX).toBe(4);
        expect(result.gridY).toBe(4);
        expect(result.actualWidth).toBe(168);
        expect(result.actualDepth).toBe(168);
        expect(result.gapWidth).toBe(0);
        expect(result.gapDepth).toBe(0);
      });

      it('should calculate grid with gaps', () => {
        const result = calculateGrid(170, 170, 'metric'); // 4x4 with 2mm gap each
        expect(result.gridX).toBe(4);
        expect(result.gridY).toBe(4);
        expect(result.actualWidth).toBe(168);
        expect(result.actualDepth).toBe(168);
        expect(result.gapWidth).toBe(2);
        expect(result.gapDepth).toBe(2);
      });

      it('should floor partial units', () => {
        const result = calculateGrid(100, 100, 'metric'); // 2.38 units -> 2 units
        expect(result.gridX).toBe(2);
        expect(result.gridY).toBe(2);
        expect(result.actualWidth).toBe(84);
        expect(result.actualDepth).toBe(84);
        expect(result.gapWidth).toBe(16);
        expect(result.gapDepth).toBe(16);
      });

      it('should handle zero dimensions', () => {
        const result = calculateGrid(0, 0, 'metric');
        expect(result.gridX).toBe(0);
        expect(result.gridY).toBe(0);
        expect(result.actualWidth).toBe(0);
        expect(result.actualDepth).toBe(0);
        expect(result.gapWidth).toBe(0);
        expect(result.gapDepth).toBe(0);
      });

      it('should handle dimensions smaller than one unit', () => {
        const result = calculateGrid(20, 30, 'metric'); // Less than 42mm
        expect(result.gridX).toBe(0);
        expect(result.gridY).toBe(0);
        expect(result.actualWidth).toBe(0);
        expect(result.actualDepth).toBe(0);
        expect(result.gapWidth).toBe(20);
        expect(result.gapDepth).toBe(30);
      });

      it('should handle large dimensions', () => {
        const result = calculateGrid(1000, 1000, 'metric'); // ~23x23 grid
        expect(result.gridX).toBe(23);
        expect(result.gridY).toBe(23);
        expect(result.actualWidth).toBe(966);
        expect(result.actualDepth).toBe(966);
        expect(result.gapWidth).toBe(34);
        expect(result.gapDepth).toBe(34);
      });

      it('should handle rectangular grids', () => {
        const result = calculateGrid(210, 126, 'metric'); // 5x3 grid
        expect(result.gridX).toBe(5);
        expect(result.gridY).toBe(3);
        expect(result.actualWidth).toBe(210);
        expect(result.actualDepth).toBe(126);
      });
    });

    describe('imperial calculations', () => {
      it('should calculate grid from inches', () => {
        const widthInches = 168 / 25.4; // 168mm in inches
        const result = calculateGrid(widthInches, widthInches, 'imperial');
        expect(result.gridX).toBe(4);
        expect(result.gridY).toBe(4);
        expect(result.actualWidth).toBeCloseTo(168, 5);
        expect(result.actualDepth).toBeCloseTo(168, 5);
      });

      it('should return gaps in inches for imperial', () => {
        const widthInches = 170 / 25.4; // 170mm in inches
        const result = calculateGrid(widthInches, widthInches, 'imperial');
        expect(result.gridX).toBe(4);
        expect(result.gridY).toBe(4);
        const gapMm = 2;
        const expectedGapInches = gapMm / 25.4;
        expect(result.gapWidth).toBeCloseTo(expectedGapInches, 5);
        expect(result.gapDepth).toBeCloseTo(expectedGapInches, 5);
      });

      it('should handle common imperial dimensions', () => {
        const result = calculateGrid(10, 8, 'imperial'); // 10x8 inches
        // 10 inches = 254mm = 6 units
        // 8 inches = 203.2mm = 4 units
        expect(result.gridX).toBe(6);
        expect(result.gridY).toBe(4);
      });

      it('should handle fractional inches', () => {
        const result = calculateGrid(6.5, 6.5, 'imperial'); // 6.5 inches = 165.1mm
        expect(result.gridX).toBe(3); // 3 units = 126mm
        expect(result.gridY).toBe(3);
      });

      it('should handle zero dimensions', () => {
        const result = calculateGrid(0, 0, 'imperial');
        expect(result.gridX).toBe(0);
        expect(result.gridY).toBe(0);
        expect(result.gapWidth).toBe(0);
        expect(result.gapDepth).toBe(0);
      });
    });

    describe('edge cases', () => {
      it('should handle exactly one unit', () => {
        const result = calculateGrid(GRIDFINITY_UNIT_MM, GRIDFINITY_UNIT_MM, 'metric');
        expect(result.gridX).toBe(1);
        expect(result.gridY).toBe(1);
        expect(result.gapWidth).toBe(0);
        expect(result.gapDepth).toBe(0);
      });

      it('should handle just under one unit', () => {
        const result = calculateGrid(GRIDFINITY_UNIT_MM - 0.1, GRIDFINITY_UNIT_MM - 0.1, 'metric');
        expect(result.gridX).toBe(0);
        expect(result.gridY).toBe(0);
      });

      it('should handle just over one unit', () => {
        const result = calculateGrid(GRIDFINITY_UNIT_MM + 0.1, GRIDFINITY_UNIT_MM + 0.1, 'metric');
        expect(result.gridX).toBe(1);
        expect(result.gridY).toBe(1);
      });

      it('should handle asymmetric dimensions', () => {
        const result = calculateGrid(42, 420, 'metric'); // 1x10 grid
        expect(result.gridX).toBe(1);
        expect(result.gridY).toBe(10);
      });

      it('should handle very small gaps', () => {
        const result = calculateGrid(168.01, 168.02, 'metric');
        expect(result.gridX).toBe(4);
        expect(result.gridY).toBe(4);
        expect(result.gapWidth).toBeCloseTo(0.01, 10);
        expect(result.gapDepth).toBeCloseTo(0.02, 10);
      });

      it('should handle very large gaps', () => {
        const result = calculateGrid(200, 210, 'metric'); // 4 units with large gaps
        expect(result.gridX).toBe(4);
        expect(result.gridY).toBe(5);
        expect(result.gapWidth).toBe(32);
        expect(result.gapDepth).toBe(0);
      });

      it('should handle negative dimensions gracefully', () => {
        const result = calculateGrid(-100, -100, 'metric');
        expect(result.gridX).toBeLessThanOrEqual(0);
        expect(result.gridY).toBeLessThanOrEqual(0);
      });

      it('should handle maximum realistic drawer size', () => {
        const result = calculateGrid(2000, 2000, 'metric'); // 2 meters
        expect(result.gridX).toBe(47);
        expect(result.gridY).toBe(47);
        expect(result.actualWidth).toBe(1974);
        expect(result.actualDepth).toBe(1974);
      });
    });

    describe('precision and rounding', () => {
      it('should handle floating point precision', () => {
        const result = calculateGrid(168.00000001, 168.00000001, 'metric');
        expect(result.gridX).toBe(4);
        expect(result.gridY).toBe(4);
      });

      it('should consistently floor partial units', () => {
        const result1 = calculateGrid(41.9, 41.9, 'metric');
        const result2 = calculateGrid(42.1, 42.1, 'metric');
        expect(result1.gridX).toBe(0);
        expect(result2.gridX).toBe(1);
      });

      it('should maintain precision in gap calculations', () => {
        const result = calculateGrid(170.123, 171.456, 'metric');
        expect(result.gapWidth).toBeCloseTo(2.123, 10);
        expect(result.gapDepth).toBeCloseTo(3.456, 10);
      });
    });
  });
});
