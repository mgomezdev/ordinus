import { useState, useRef, useEffect } from 'react';
import {
  DEFAULT_BIN_CUSTOMIZATION,
} from '../types/gridfinity';
import type {
  BinCustomization,
  CustomizableField,
  FingerSlide,
  GeneratorParams,
  LipStyle,
  WallCutout,
  WallPattern,
} from '../types/gridfinity';
import { generatorParamsToBinCustomization } from '../utils/generatorParams';

const MM_PER_HEIGHT_UNIT = 7;

interface HeightFieldProps {
  height: number;
  idPrefix: string;
  onChange: (height: number) => void;
}

function HeightField({ height, idPrefix, onChange }: HeightFieldProps) {
  const [mmEditValue, setMmEditValue] = useState<string | null>(null);
  const [correctionMsg, setCorrectionMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const displayedMm = mmEditValue ?? String(height * MM_PER_HEIGHT_UNIT);

  const handleUnitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1 && v <= 20) {
      onChange(v);
    }
  };

  const handleMmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMmEditValue(e.target.value);
  };

  const handleMmBlur = () => {
    const raw = parseInt(mmEditValue ?? '', 10);
    setMmEditValue(null);
    if (isNaN(raw) || raw < MM_PER_HEIGHT_UNIT) return;
    const units = Math.floor(raw / MM_PER_HEIGHT_UNIT);
    const snapped = units * MM_PER_HEIGHT_UNIT;
    if (snapped !== raw) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCorrectionMsg(`Rounded to ${units}u (${snapped}mm)`);
      timerRef.current = setTimeout(() => setCorrectionMsg(null), 2000);
    }
    if (units >= 1 && units <= 20) {
      onChange(units);
    }
  };

  return (
    <div className="bin-customization-field">
      <label htmlFor={`${idPrefix}height-units-input`}>Height</label>
      <div className="height-inputs">
        <input
          id={`${idPrefix}height-units-input`}
          aria-label="Height in units"
          type="number"
          min={1}
          max={20}
          value={height}
          onChange={handleUnitChange}
        />
        <span>u</span>
        <input
          id={`${idPrefix}height-mm-input`}
          aria-label="Height in millimeters"
          type="number"
          min={MM_PER_HEIGHT_UNIT}
          value={displayedMm}
          onChange={handleMmChange}
          onBlur={handleMmBlur}
        />
        <span>mm</span>
      </div>
      {correctionMsg && (
        <div className="height-correction" role="status">{correctionMsg}</div>
      )}
    </div>
  );
}

interface BinCustomizationPanelProps {
  customization: BinCustomization | undefined;
  onChange: (customization: BinCustomization) => void;
  onReset: () => void;
  customizableFields: CustomizableField[];
  parameters?: GeneratorParams;
  idPrefix?: string;
}

const WALL_PATTERN_OPTIONS: WallPattern[] = [
  'none', 'grid', 'hexgrid', 'voronoi', 'voronoigrid', 'voronoihexgrid',
];
const LIP_STYLE_OPTIONS: LipStyle[] = ['normal', 'reduced', 'minimum', 'none'];
const FINGER_SLIDE_OPTIONS: FingerSlide[] = ['none', 'rounded', 'chamfered'];
const WALL_CUTOUT_OPTIONS: WallCutout[] = ['none', 'vertical', 'horizontal', 'both'];

export function BinCustomizationPanel({
  customization,
  onChange,
  onReset,
  customizableFields,
  parameters,
  idPrefix = '',
}: BinCustomizationPanelProps) {
  if (customizableFields.length === 0) return null;

  const libraryDefaults = parameters
    ? generatorParamsToBinCustomization(parameters, customizableFields)
    : {};
  const effectiveDefaults = { ...DEFAULT_BIN_CUSTOMIZATION, ...libraryDefaults };
  const current: BinCustomization = customization ?? effectiveDefaults;
  const isDefault =
    current.wallPattern === effectiveDefaults.wallPattern &&
    current.lipStyle === effectiveDefaults.lipStyle &&
    current.fingerSlide === effectiveDefaults.fingerSlide &&
    current.wallCutout === effectiveDefaults.wallCutout &&
    current.height === effectiveDefaults.height;

  const has = (f: CustomizableField) => customizableFields.includes(f);

  return (
    <div className="bin-customization-panel">
      {has('wallPattern') && (
        <div className="bin-customization-field">
          <label htmlFor={`${idPrefix}wall-pattern-select`}>Wall Pattern</label>
          <select
            id={`${idPrefix}wall-pattern-select`}
            value={current.wallPattern}
            onChange={(e) => onChange({ ...current, wallPattern: e.target.value as WallPattern })}
          >
            {WALL_PATTERN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {has('lipStyle') && (
        <div className="bin-customization-field">
          <label htmlFor={`${idPrefix}lip-style-select`}>Lip Style</label>
          <select
            id={`${idPrefix}lip-style-select`}
            value={current.lipStyle}
            onChange={(e) => onChange({ ...current, lipStyle: e.target.value as LipStyle })}
          >
            {LIP_STYLE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {has('fingerSlide') && (
        <div className="bin-customization-field">
          <label htmlFor={`${idPrefix}finger-slide-select`}>Finger Slide</label>
          <select
            id={`${idPrefix}finger-slide-select`}
            value={current.fingerSlide}
            onChange={(e) => onChange({ ...current, fingerSlide: e.target.value as FingerSlide })}
          >
            {FINGER_SLIDE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {has('wallCutout') && (
        <div className="bin-customization-field">
          <label htmlFor={`${idPrefix}wall-cutout-select`}>Wall Cutout</label>
          <select
            id={`${idPrefix}wall-cutout-select`}
            value={current.wallCutout}
            onChange={(e) => onChange({ ...current, wallCutout: e.target.value as WallCutout })}
          >
            {WALL_CUTOUT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {has('height') && (
        <HeightField
          height={current.height}
          idPrefix={idPrefix}
          onChange={(h) => onChange({ ...current, height: h })}
        />
      )}

      <button type="button" onClick={onReset} disabled={isDefault}>
        Reset to Defaults
      </button>
    </div>
  );
}
