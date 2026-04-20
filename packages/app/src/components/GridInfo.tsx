import type { UnitSystem, ImperialFormat } from '../types/gridfinity';
import { mmToInches, decimalToFraction } from '../utils/conversions';

interface GridInfoProps {
  gridX: number;
  gridY: number;
  actualWidth: number;
  actualDepth: number;
  gapWidth: number;
  gapDepth: number;
  unit: UnitSystem;
  imperialFormat: ImperialFormat;
}

export function GridInfo({
  gridX,
  gridY,
  actualWidth,
  actualDepth,
  gapWidth,
  gapDepth,
  unit,
  imperialFormat,
}: GridInfoProps) {
  if (gridX <= 0 || gridY <= 0) {
    return null;
  }

  const widthInches = mmToInches(actualWidth);
  const depthInches = mmToInches(actualDepth);

  const formatImperial = (val: number) =>
    imperialFormat === 'fractional'
      ? decimalToFraction(val)
      : val.toFixed(2);

  const unitLabel = unit === 'metric' ? 'mm' : 'in';
  const formatGap = (gap: number) => {
    if (unit === 'metric') {
      return gap.toFixed(1);
    }
    return imperialFormat === 'fractional'
      ? decimalToFraction(gap)
      : gap.toFixed(2);
  };

  return (
    <div className="grid-info">
      <div className="info-row">
        <span className="info-label">Grid Size:</span>
        <span className="info-value">
          {gridX} x {gridY} units
        </span>
      </div>
      <div className="info-row">
        <span className="info-label">Actual Size (mm):</span>
        <span className="info-value">
          {actualWidth} x {actualDepth} mm
        </span>
      </div>
      <div className="info-row">
        <span className="info-label">Actual Size (in):</span>
        <span className="info-value">
          {formatImperial(widthInches)} x {formatImperial(depthInches)} in
        </span>
      </div>
      <div className="info-row">
        <span className="info-label">Gap:</span>
        <span className="info-value">
          {formatGap(gapWidth)} x {formatGap(gapDepth)} {unitLabel}
        </span>
      </div>
    </div>
  );
}
