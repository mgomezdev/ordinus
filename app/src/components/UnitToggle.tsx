import type { UnitSystem, ImperialFormat } from '../types/gridfinity';

interface UnitToggleProps {
  unit: UnitSystem;
  imperialFormat: ImperialFormat;
  onUnitChange: (unit: UnitSystem) => void;
  onImperialFormatChange: (format: ImperialFormat) => void;
}

export function UnitToggle({
  unit,
  imperialFormat,
  onUnitChange,
  onImperialFormatChange,
}: UnitToggleProps) {
  return (
    <div className="unit-controls">
      <div className="unit-toggle">
        <button
          className={unit === 'metric' ? 'active' : ''}
          onClick={() => onUnitChange('metric')}
        >
          mm
        </button>
        <button
          className={unit === 'imperial' ? 'active' : ''}
          onClick={() => onUnitChange('imperial')}
        >
          inches
        </button>
      </div>
      {unit === 'imperial' && (
        <div className="format-toggle">
          <button
            className={imperialFormat === 'decimal' ? 'active' : ''}
            onClick={() => onImperialFormatChange('decimal')}
          >
            10.75
          </button>
          <button
            className={imperialFormat === 'fractional' ? 'active' : ''}
            onClick={() => onImperialFormatChange('fractional')}
          >
            10 3/4
          </button>
        </div>
      )}
    </div>
  );
}
