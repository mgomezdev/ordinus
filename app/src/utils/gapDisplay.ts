import type {
  GridSpacerConfig,
  ImperialFormat,
  SpacerMode,
  UnitSystem,
} from '../types/gridfinity';
import { floorToFraction, floorToDecimalPlaces } from './conversions';

const GAP_DECIMAL_PLACES = 1;
const SPLIT_SEPARATOR = ' + ';

// Always rounds down: a displayed gap must never overstate the space available
export function formatGapValue(
  gap: number,
  unit: UnitSystem,
  imperialFormat: ImperialFormat
): string {
  if (unit === 'imperial' && imperialFormat === 'fractional') {
    return floorToFraction(gap);
  }
  return floorToDecimalPlaces(gap, GAP_DECIMAL_PLACES);
}

export function formatAxisGap(
  gap: number,
  mode: SpacerMode,
  unit: UnitSystem,
  imperialFormat: ImperialFormat
): string {
  if (mode !== 'symmetrical') {
    return formatGapValue(gap, unit, imperialFormat);
  }
  const half = formatGapValue(gap / 2, unit, imperialFormat);
  return `${half}${SPLIT_SEPARATOR}${half}`;
}

export function formatGapPair(
  gapWidth: number,
  gapDepth: number,
  spacerConfig: GridSpacerConfig,
  unit: UnitSystem,
  imperialFormat: ImperialFormat
): string {
  const unitLabel = unit === 'metric' ? 'mm' : 'in';
  const width = formatAxisGap(gapWidth, spacerConfig.horizontal, unit, imperialFormat);
  const depth = formatAxisGap(gapDepth, spacerConfig.vertical, unit, imperialFormat);
  if (width === depth) {
    return `${width} ${unitLabel}`;
  }
  return `${width} x ${depth} ${unitLabel}`;
}
