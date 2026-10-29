import type { UnitSystem, ImperialFormat, GridSpacerConfig } from '../types/gridfinity';
import { formatGapPair } from '../utils/gapDisplay';

interface GridSummaryProps {
  gridX: number;
  gridY: number;
  gapWidth: number;
  gapDepth: number;
  spacerConfig: GridSpacerConfig;
  unit: UnitSystem;
  imperialFormat: ImperialFormat;
}

export function GridSummary({
  gridX,
  gridY,
  gapWidth,
  gapDepth,
  spacerConfig,
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

  const gapDisplay = formatGapPair(gapWidth, gapDepth, spacerConfig, unit, imperialFormat);

  return (
    <div className="grid-summary">
      <span className="grid-summary-size">{gridX} x {gridY} units</span>
      <span className="grid-summary-gap">Gap: {gapDisplay}</span>
    </div>
  );
}
