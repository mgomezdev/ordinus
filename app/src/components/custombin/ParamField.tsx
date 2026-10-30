import { useState } from 'react';
import { GENERATOR_PARAM_SCHEMA, effectiveDefault } from '@gridfinity/shared';
import type { ParamDef } from '@gridfinity/shared';

const LABEL_BY_NAME = new Map(GENERATOR_PARAM_SCHEMA.map(d => [d.name, d.label]));

export interface ParamFieldForm {
  isOverridden: (name: string) => boolean;
  isEnabled: (name: string) => boolean;
  valueOf: (name: string) => unknown;
  setOverride: (name: string, value: unknown) => void;
  resetOverride: (name: string) => void;
}

interface ParamFieldProps {
  def: ParamDef;
  form: ParamFieldForm;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (value === 'true') return 'on';
  if (value === 'false') return 'off';
  return String(value);
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

interface InputProps {
  def: ParamDef;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
}

function NumberInput({ def, value, onChange, onBlur }: InputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="number"
      aria-label={def.label}
      min={def.min}
      max={def.max}
      step={def.step}
      value={draft ?? String(value)}
      onChange={e => {
        setDraft(e.target.value);
        const parsed = parseFloat(e.target.value);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        setDraft(null);
        onBlur();
      }}
    />
  );
}

function ArrayInput({ def, value, onChange, onBlur }: InputProps) {
  const items = Array.isArray(value) ? (value as number[]) : [];
  return (
    <span className="param-array">
      {items.map((item, index) => (
        <input
          key={index}
          type="number"
          aria-label={`${def.label} ${index + 1}`}
          min={def.elementMin}
          max={def.elementMax}
          step={def.step ?? 'any'}
          value={item}
          onChange={e => {
            const parsed = parseFloat(e.target.value);
            if (Number.isFinite(parsed)) onChange(items.map((v, i) => (i === index ? parsed : v)));
          }}
          onBlur={onBlur}
        />
      ))}
    </span>
  );
}

function ValueInput(props: InputProps) {
  const { def, value, onChange, onBlur } = props;
  switch (def.kind) {
    case 'number':
      return <NumberInput {...props} />;
    case 'array':
      return <ArrayInput {...props} />;
    case 'bool':
      return (
        <input type="checkbox" aria-label={def.label} checked={asBoolean(value)} onChange={e => onChange(e.target.checked)} onBlur={onBlur} />
      );
    case 'enum':
      return (
        <select aria-label={def.label} value={String(value)} onChange={e => onChange(e.target.value)} onBlur={onBlur}>
          {def.options?.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    case 'string':
      return (
        <input type="text" aria-label={def.label} maxLength={def.maxLength} value={String(value)} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      );
  }
}

export function ParamField({ def, form }: ParamFieldProps) {
  const [editing, setEditing] = useState(false);
  const overridden = form.isOverridden(def.name);
  const enabled = form.isEnabled(def.name);
  const active = overridden || editing;
  const defaultValue = effectiveDefault(def);

  const requires = def.enabledBy ? LABEL_BY_NAME.get(def.enabledBy) : undefined;

  return (
    <div
      className="custom-bin-param"
      data-testid={`param-${def.name}`}
      data-state={overridden ? 'override' : 'default'}
    >
      <label className="custom-bin-param-label" title={def.help}>{def.label}</label>
      {active ? (
        <>
          <ValueInput
            def={def}
            value={form.valueOf(def.name)}
            onChange={value => form.setOverride(def.name, value)}
            onBlur={() => { if (!form.isOverridden(def.name)) setEditing(false); }}
          />
          <button
            type="button"
            className="custom-bin-param-reset"
            aria-label={`Reset ${def.label}`}
            onClick={() => { form.resetOverride(def.name); setEditing(false); }}
          >↺</button>
        </>
      ) : (
        <>
          <span className="custom-bin-param-default">{formatValue(defaultValue)}</span>
          <button
            type="button"
            className="custom-bin-param-override"
            aria-label={`Override ${def.label}`}
            disabled={!enabled}
            title={enabled ? undefined : `Requires ${requires ?? 'another option'}`}
            onClick={() => setEditing(true)}
          >Override</button>
        </>
      )}
    </div>
  );
}
