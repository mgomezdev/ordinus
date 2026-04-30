import type { UnitSystem, ImperialFormat } from '../types/gridfinity';
import { decimalToFraction } from '../utils/conversions';

interface GridSummaryProps {
  gridX: number;
  gridY: number;
  gapWidth: number;
  gapDepth: number;
  unit: UnitSystem;
  imperialFormat: ImperialFormat;
}

export function GridSummary({
  gridX,
  gridY,
  gapWidth,
  gapDepth,
  unit,
  imperialFormat,
}: GridSummaryProps) {
  if (gridX <= 0 || gridY <= 0) {
    return (
      <div className="grid-summary">
        <span className="grid-summary-size">--</span>
      </div>
    );
  }

  const unitLabel = unit === 'metric' ? 'mm' : 'in';
  const formatGap = (gap: number) => {
    if (unit === 'metric') {
      return gap.toFixed(1);
    }
    return imperialFormat === 'fractional'
      ? decimalToFraction(gap)
      : gap.toFixed(2);
  };

  const gapDisplay = gapWidth === gapDepth
    ? `${formatGap(gapWidth)} ${unitLabel}`
    : `${formatGap(gapWidth)} x ${formatGap(gapDepth)} ${unitLabel}`;

  return (
    <div className="grid-summary">
      <span className="grid-summary-size">{gridX} x {gridY} units</span>
      <span className="grid-summary-gap">Gap: {gapDisplay}</span>
    </div>
  );
}
