import type { UnitSystem, GridResult } from '../types/gridfinity';

const GRIDFINITY_UNIT_MM = 42;
const MM_PER_INCH = 25.4;

const FRACTION_DENOMINATORS = [16, 8, 4, 2] as const;

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

export function decimalToFraction(decimal: number): string {
  const whole = Math.floor(decimal);
  const fractionalPart = decimal - whole;

  if (fractionalPart < 0.03125) {
    return whole.toString();
  }

  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = fractionalPart;

  for (const denom of FRACTION_DENOMINATORS) {
    const numerator = Math.round(fractionalPart * denom);
    const error = Math.abs(fractionalPart - numerator / denom);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numerator;
      bestDenominator = denom;
    }
  }

  if (bestNumerator === 0) {
    return whole.toString();
  }

  if (bestNumerator === bestDenominator) {
    return (whole + 1).toString();
  }

  const divisor = gcd(bestNumerator, bestDenominator);
  const reducedNum = bestNumerator / divisor;
  const reducedDenom = bestDenominator / divisor;

  if (whole === 0) {
    return `${reducedNum}/${reducedDenom}`;
  }

  return `${whole} ${reducedNum}/${reducedDenom}`;
}

export function fractionToDecimal(fraction: string): number {
  const trimmed = fraction.trim();
  if (!trimmed) return 0;

  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const denom = parseInt(mixedMatch[3], 10);
    return whole + (denom > 0 ? num / denom : 0);
  }

  const fractionMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10);
    const denom = parseInt(fractionMatch[2], 10);
    return denom > 0 ? num / denom : 0;
  }

  const decimal = parseFloat(trimmed);
  return isNaN(decimal) ? 0 : decimal;
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH;
}

export function calculateGrid(
  width: number,
  depth: number,
  unit: UnitSystem
): GridResult {
  const widthMm = unit === 'imperial' ? inchesToMm(width) : width;
  const depthMm = unit === 'imperial' ? inchesToMm(depth) : depth;

  const gridX = Math.floor(widthMm / GRIDFINITY_UNIT_MM);
  const gridY = Math.floor(depthMm / GRIDFINITY_UNIT_MM);

  const actualWidthMm = gridX * GRIDFINITY_UNIT_MM;
  const actualDepthMm = gridY * GRIDFINITY_UNIT_MM;

  const gapWidthMm = widthMm - actualWidthMm;
  const gapDepthMm = depthMm - actualDepthMm;

  return {
    gridX,
    gridY,
    actualWidth: actualWidthMm,
    actualDepth: actualDepthMm,
    gapWidth: unit === 'imperial' ? mmToInches(gapWidthMm) : gapWidthMm,
    gapDepth: unit === 'imperial' ? mmToInches(gapDepthMm) : gapDepthMm,
  };
}
