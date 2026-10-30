import { useState } from 'react';
import { CUSTOM_BIN_MAX, CUSTOM_BIN_MIN, CUSTOM_BIN_STEP } from '@gridfinity/shared';
import type { SizeAxis } from './useCustomBinForm';

const GRID_UNIT_MM = 42;
const HEIGHT_UNIT_MM = 7;

interface SizeFieldProps {
  axis: SizeAxis;
  label: string;
  value: number;
  onChange: (axis: SizeAxis, value: number) => void;
}

function SizeField({ axis, label, value, onChange }: SizeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const lower = label.toLowerCase();

  const commit = () => {
    if (draft !== null) onChange(axis, parseFloat(draft));
    setDraft(null);
  };

  return (
    <div className="custom-bin-size-field">
      <label htmlFor={`custom-bin-${axis}`}>{label}</label>
      <div className="custom-bin-stepper">
        <button
          type="button"
          aria-label={`Decrease ${lower}`}
          disabled={value <= CUSTOM_BIN_MIN}
          onClick={() => onChange(axis, value - CUSTOM_BIN_STEP)}
        >−</button>
        <input
          id={`custom-bin-${axis}`}
          type="number"
          aria-label={`${label} in units`}
          min={CUSTOM_BIN_MIN}
          max={CUSTOM_BIN_MAX}
          step={CUSTOM_BIN_STEP}
          value={draft ?? value}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        />
        <button
          type="button"
          aria-label={`Increase ${lower}`}
          disabled={value >= CUSTOM_BIN_MAX}
          onClick={() => onChange(axis, value + CUSTOM_BIN_STEP)}
        >+</button>
      </div>
    </div>
  );
}

interface SizeInputsProps {
  width: number;
  depth: number;
  height: number;
  onChange: (axis: SizeAxis, value: number) => void;
}

export function SizeInputs({ width, depth, height, onChange }: SizeInputsProps) {
  return (
    <div className="custom-bin-size">
      <div className="custom-bin-size-fields">
        <SizeField axis="width" label="Width" value={width} onChange={onChange} />
        <SizeField axis="depth" label="Depth" value={depth} onChange={onChange} />
        <SizeField axis="height" label="Height" value={height} onChange={onChange} />
      </div>
      <div className="custom-bin-size-mm">
        {`${width * GRID_UNIT_MM} × ${depth * GRID_UNIT_MM} × ${height * HEIGHT_UNIT_MM} mm`}
      </div>
    </div>
  );
}
