import { useState } from 'react';
import type { UnitSystem, ImperialFormat } from '../types/gridfinity';
import {
  decimalToFraction,
  fractionToDecimal,
} from '../utils/conversions';

interface DimensionInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit: UnitSystem;
  imperialFormat: ImperialFormat;
}

export function DimensionInput({
  label,
  value,
  onChange,
  unit,
  imperialFormat,
}: DimensionInputProps) {
  const unitLabel = unit === 'metric' ? 'mm' : 'in';
  const isFractional = unit === 'imperial' && imperialFormat === 'fractional';

  const [editValue, setEditValue] = useState<string | null>(null);

  const displayValue = isFractional
    ? decimalToFraction(value)
    : value.toString();

  const handleFocus = () => {
    setEditValue(displayValue);
  };

  const handleBlur = () => {
    if (isFractional && editValue !== null) {
      const decimal = fractionToDecimal(editValue);
      if (decimal !== value) {
        onChange(decimal);
      }
    }
    setEditValue(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setEditValue(input);

    if (isFractional) {
      const decimal = fractionToDecimal(input);
      if (decimal !== value) {
        onChange(decimal);
      }
    } else {
      const parsed = parseFloat(input) || 0;
      if (parsed !== value) {
        onChange(parsed);
      }
    }
  };

  if (isFractional) {
    return (
      <div className="dimension-input">
        <label>
          <span className="dimension-label">{label}</span>
          <div className="input-wrapper">
            <input
              type="text"
              value={editValue !== null ? editValue : displayValue}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="e.g. 10 3/4"
            />
            <span className="unit-label">{unitLabel}</span>
          </div>
        </label>
      </div>
    );
  }

  return (
    <div className="dimension-input">
      <label>
        <span className="dimension-label">{label}</span>
        <div className="input-wrapper">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            min={0}
            step={unit === 'metric' ? 1 : 0.1}
          />
          <span className="unit-label">{unitLabel}</span>
        </div>
      </label>
    </div>
  );
}
