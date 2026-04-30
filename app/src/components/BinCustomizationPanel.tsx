import { useState, useEffect } from 'react';
import {
  DEFAULT_BIN_CUSTOMIZATION,
} from '../types/gridfinity';
import type {
  BinCustomization,
  CustomizableField,
  CustomizableFieldDef,
  FingerSlide,
  GeneratorParams,
  LipStyle,
  WallPattern,
} from '../types/gridfinity';

import { generatorParamsToBinCustomization } from '../utils/generatorParams';

const MM_PER_HEIGHT_UNIT = 7;

interface HeightFieldProps {
  height: number;
  min: number;
  max: number;
  idPrefix: string;
  onChange: (height: number) => void;
}

function HeightField({ height, min, max, idPrefix, onChange }: HeightFieldProps) {
  const [inputValue, setInputValue] = useState(String(height));

  useEffect(() => {
    setInputValue(String(height));
  }, [height]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw, 10);
    const clamped = isNaN(parsed) ? height : Math.max(min, Math.min(max, parsed));
    onChange(clamped);
    setInputValue(String(clamped));
  };

  return (
    <div className="bin-customization-field">
      <label htmlFor={`${idPrefix}height-stepper-input`}>Height</label>
      <div className="height-stepper">
        <button
          type="button"
          className="height-stepper-btn"
          onClick={() => onChange(Math.max(min, height - 1))}
          disabled={height <= min}
          aria-label="Decrease height"
        >−</button>
        <input
          id={`${idPrefix}height-stepper-input`}
          className="height-stepper-input"
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="Height in units"
        />
        <button
          type="button"
          className="height-stepper-btn"
          onClick={() => onChange(Math.min(max, height + 1))}
          disabled={height >= max}
          aria-label="Increase height"
        >+</button>
      </div>
      <div className="height-stepper-mm">{height * MM_PER_HEIGHT_UNIT} mm</div>
    </div>
  );
}

interface BinCustomizationPanelProps {
  customization: BinCustomization | undefined;
  onChange: (customization: BinCustomization) => void;
  onReset: () => void;
  customizableFields: CustomizableFieldDef[];
  parameters?: GeneratorParams;
  idPrefix?: string;
}

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
    !current.wallPatternEnabled &&
    current.lipStyle === effectiveDefaults.lipStyle &&
    current.fingerSlide === effectiveDefaults.fingerSlide &&
    current.wallCutout.front === effectiveDefaults.wallCutout.front &&
    current.wallCutout.back === effectiveDefaults.wallCutout.back &&
    current.wallCutout.left === effectiveDefaults.wallCutout.left &&
    current.wallCutout.right === effectiveDefaults.wallCutout.right &&
    current.height === effectiveDefaults.height;

  const fieldDef = (name: CustomizableField) => customizableFields.find(d => d.field === name);
  const has = (name: CustomizableField) => fieldDef(name) !== undefined;
  const optionsFor = (name: CustomizableField): string[] => {
    const def = fieldDef(name);
    return def && 'options' in def ? def.options : [];
  };

  const heightDef = fieldDef('height');
  const heightMin = heightDef && 'min' in heightDef ? heightDef.min : 1;
  const heightMax = heightDef && 'max' in heightDef ? heightDef.max : 20;

  return (
    <div className="bin-customization-panel">
      {has('wallPatternEnabled') && (
        <div className="bin-customization-field">
          <label htmlFor={`${idPrefix}wall-pattern-enabled`}>Wall Pattern</label>
          <input
            id={`${idPrefix}wall-pattern-enabled`}
            type="checkbox"
            checked={current.wallPatternEnabled}
            onChange={(e) => onChange({ ...current, wallPatternEnabled: e.target.checked })}
          />
        </div>
      )}
      {has('wallPattern') && current.wallPatternEnabled && (
        <div className="bin-customization-field">
          <label htmlFor={`${idPrefix}wall-pattern-select`}>Style</label>
          <select
            id={`${idPrefix}wall-pattern-select`}
            value={current.wallPattern}
            onChange={(e) => onChange({ ...current, wallPattern: e.target.value as WallPattern })}
          >
            {optionsFor('wallPattern').map((o) => <option key={o} value={o}>{o}</option>)}
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
            {optionsFor('lipStyle').map((o) => <option key={o} value={o}>{o}</option>)}
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
            {optionsFor('fingerSlide').map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {has('wallCutout') && (
        <fieldset className="bin-customization-field wall-cutout-fieldset">
          <legend>Wall Cutout</legend>
          <div className="wall-cutout-checkboxes">
            {(['front', 'back', 'left', 'right'] as const).map((wall) => (
              <label key={wall} className="wall-cutout-checkbox-label">
                <input
                  type="checkbox"
                  checked={current.wallCutout[wall]}
                  onChange={(e) =>
                    onChange({ ...current, wallCutout: { ...current.wallCutout, [wall]: e.target.checked } })
                  }
                />
                {wall.charAt(0).toUpperCase() + wall.slice(1)}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {has('height') && (
        <HeightField
          height={current.height}
          min={heightMin}
          max={heightMax}
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
