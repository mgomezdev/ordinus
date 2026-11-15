import { useState } from 'react';
import { effectiveDefault, GENERATOR_PARAM_SCHEMA, validateCuratedLibrary } from '@gridfinity/shared';
import type { CuratedAxis, CuratedEntry, CuratedLibrary, ParamDef, ParametricCuratedEntry } from '@gridfinity/shared';
import type { LibraryItem } from '../../types/gridfinity';

const DIMENSIONS: ParamDef[] = ['height', 'width', 'depth'].map(name => ({ name, label: name === 'height' ? 'Height (7 mm units)' : `${name === 'width' ? 'Width' : 'Depth'} (grid units)`, group: 'General', kind: 'number', default: 4, min: 0.5, max: 20, step: 0.5 }));
const PARAMS = [...DIMENSIONS, ...GENERATOR_PARAM_SCHEMA];
const uid = () => crypto.randomUUID();

function ParameterValues({ values, onChange }: { values: Record<string, unknown>; onChange: (values: Record<string, unknown>) => void }) {
  const [parameter, setParameter] = useState('height');
  const update = (key: string, value: unknown) => onChange({ ...values, [key]: value });
  return <div className="preset-values">
    {Object.entries(values).map(([key, value]) => {
      const def = PARAMS.find(p => p.name === key);
      return <div className="preset-value" key={key}>
        <label>{def?.label ?? key}
          {def?.kind === 'enum' || def?.kind === 'bool' ? <select value={String(value)} onChange={e => update(key, def.kind === 'bool' ? e.target.value === 'true' : e.target.value)}>
            {(def.kind === 'bool' ? ['true', 'false'] : def.options ?? []).map(option => <option key={option}>{option}</option>)}
          </select> : def?.kind === 'array' ? <div className="preset-array">{(Array.isArray(value) ? value : []).map((n: unknown, i: number) => <input key={i} aria-label={`${def.label} value ${i + 1}`} type="number" step="any" value={String(n)} onChange={e => update(key, (value as unknown[]).map((old, index) => index === i ? Number(e.target.value) : old))} />)}</div>
          : <input type={def?.kind === 'number' ? 'number' : 'text'} min={def?.min} max={def?.max} step={def?.step ?? 'any'} value={String(value ?? '')} onChange={e => update(key, def?.kind === 'number' ? Number(e.target.value) : e.target.value)} />}
        </label>
        <button type="button" aria-label={`Remove ${def?.label ?? key}`} onClick={() => onChange(Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)))}>×</button>
      </div>;
    })}
    <div className="simple-row"><label>Input<select value={parameter} onChange={e => setParameter(e.target.value)}>{PARAMS.map(def => <option key={def.name} value={def.name}>{def.label}</option>)}</select></label>
      <button type="button" disabled={Object.hasOwn(values, parameter)} onClick={() => { const def = PARAMS.find(p => p.name === parameter); if (def) update(parameter, DIMENSIONS.includes(def) ? def.default : effectiveDefault(def)); }}>Add input</button>
    </div>
  </div>;
}

function AxisEditor({ label, axis, onChange }: { label: string; axis: CuratedAxis; onChange: (axis: CuratedAxis) => void }) {
  const mode = 'fixed' in axis ? 'fixed' : 'values' in axis ? 'values' : 'range';
  return <fieldset><legend>{label} (grid units)</legend>
    <label>Sizing<select value={mode} onChange={e => onChange(e.target.value === 'fixed' ? { fixed: 2 } : e.target.value === 'values' ? { values: [1, 2, 3] } : { min: 0.5, max: 20, step: 0.5 })}>
      <option value="range">Draw within a range</option><option value="values">Draw from allowed sizes</option><option value="fixed">Fixed</option>
    </select></label>
    {'fixed' in axis ? <label>Fixed {label.toLowerCase()}<input type="number" min="0.5" max="20" step="0.5" value={axis.fixed} onChange={e => onChange({ fixed: Number(e.target.value) })} /></label>
      : 'values' in axis ? <label>Allowed sizes (comma separated)<input defaultValue={axis.values.join(', ')} onBlur={e => onChange({ values: e.target.value.split(',').map(Number) })} /></label>
      : <div className="simple-row">{(['min', 'max', 'step'] as const).map(key => <label key={key}>{key === 'min' ? 'Minimum' : key === 'max' ? 'Maximum' : 'Step'}<input type="number" min="0.5" max="20" step="0.5" value={axis[key]} onChange={e => onChange({ ...axis, [key]: Number(e.target.value) })} /></label>)}</div>}
  </fieldset>;
}

function ParametricEditor({ entry, onChange }: { entry: ParametricCuratedEntry; onChange: (entry: ParametricCuratedEntry) => void }) {
  return <>
    <p className="simple-help">Uses the existing Custom bin model. Width and depth come from the drawn rectangle; named options can set height and other inputs.</p>
    <AxisEditor label="Width" axis={entry.width} onChange={width => onChange({ ...entry, width })} />
    <AxisEditor label="Depth" axis={entry.depth} onChange={depth => onChange({ ...entry, depth })} />
    <details><summary>Default inputs</summary><ParameterValues values={entry.defaults} onChange={defaults => onChange({ ...entry, defaults })} /></details>
    <h4>Named options</h4>
    {entry.groups.map((group, gi) => {
      const updateGroup = (changed: typeof group) => onChange({ ...entry, groups: entry.groups.map((g, i) => i === gi ? changed : g) });
      return <fieldset key={group.id}><legend>Option group {gi + 1}</legend>
        <div className="simple-row"><label>Option name<input value={group.name} onChange={e => updateGroup({ ...group, name: e.target.value })} /></label>
          <button type="button" onClick={() => onChange({ ...entry, groups: entry.groups.filter((_, i) => i !== gi) })}>Remove option</button></div>
        {group.choices.map((choice, ci) => <details key={choice.id} open={undefined}>
          <summary>{choice.name || 'Unnamed choice'}</summary>
          <label>Choice name<input value={choice.name} onChange={e => updateGroup({ ...group, choices: group.choices.map((c, i) => i === ci ? { ...c, name: e.target.value } : c) })} /></label>
          <ParameterValues values={choice.values} onChange={values => updateGroup({ ...group, choices: group.choices.map((c, i) => i === ci ? { ...c, values } : c) })} />
          <button type="button" onClick={() => updateGroup({ ...group, choices: group.choices.filter((_, i) => i !== ci) })}>Remove choice</button>
        </details>)}
        <button type="button" onClick={() => updateGroup({ ...group, choices: [...group.choices, { id: uid(), name: 'New choice', values: { height: 4 } }] })}>Add choice</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => onChange({ ...entry, groups: [...entry.groups, { id: uid(), name: 'Height', choices: [
      { id: uid(), name: 'Short', values: { height: 2 } }, { id: uid(), name: 'Medium', values: { height: 4 } }, { id: uid(), name: 'Tall', values: { height: 6 } },
    ] }] })}>Add named option</button>
  </>;
}

interface Props {
  initial: CuratedLibrary; items: LibraryItem[]; pending: boolean; error: string | null;
  onSave: (library: CuratedLibrary) => void; onCancel: () => void; onDelete?: () => void;
}

export function CuratedLibraryEditor({ initial, items, pending, error, onSave, onCancel, onDelete }: Props) {
  const [library, setLibrary] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial.entries[0]?.id ?? null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const selectedSource = items.find(item => item.id === source);
  const entry = library.entries.find(e => e.id === selected);
  const errors = [...validateCuratedLibrary(library), ...library.entries.flatMap(e => {
    if (e.kind !== 'fixed') return [];
    const source = items.find(item => item.id === e.sourceId);
    return source && source.widthUnits === e.width && source.heightUnits === e.depth ? [] : [`${e.name}: source is unavailable or its footprint changed. Remove this entry and choose its source again.`];
  })];
  const updateEntry = (changed: CuratedEntry) => setLibrary({ ...library, entries: library.entries.map(e => e.id === changed.id ? changed : e) });
  const add = (added: CuratedEntry) => { setLibrary({ ...library, entries: [...library.entries, added] }); setSelected(added.id); };
  const move = (index: number, direction: number) => {
    const entries = [...library.entries];
    [entries[index], entries[index + direction]] = [entries[index + direction], entries[index]];
    setLibrary({ ...library, entries });
  };
  return <form className="curated-editor" aria-label="Library editor" onSubmit={e => { e.preventDefault(); if (!errors.length) onSave(library); }}>
    <h3>{onDelete ? 'Edit library' : 'New library'}</h3>
    <label>Library name<input required maxLength={200} value={library.name} onChange={e => setLibrary({ ...library, name: e.target.value })} /></label>
    <label>Description<textarea maxLength={1000} value={library.description} onChange={e => setLibrary({ ...library, description: e.target.value })} /></label>
    <h4>Selected bins</h4>
    {library.entries.length === 0 && <p>Add existing bins or a parametric bin below.</p>}
    <ol className="curated-entry-list">{library.entries.map((e, i) => <li key={e.id}>
      <button type="button" aria-pressed={selected === e.id} onClick={() => setSelected(e.id)}>{e.name}</button>
      <button type="button" aria-label={`Move ${e.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
      <button type="button" aria-label={`Move ${e.name} down`} disabled={i === library.entries.length - 1} onClick={() => move(i, 1)}>↓</button>
      <button type="button" aria-label={`Remove ${e.name}`} onClick={() => { setLibrary({ ...library, entries: library.entries.filter(x => x.id !== e.id) }); if (selected === e.id) setSelected(null); }}>×</button>
    </li>)}</ol>
    <details><summary>Add an existing bin</summary>
      <label>Find bins<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Existing bin<select value={source} onChange={e => setSource(e.target.value)}><option value="">Choose a bin</option>{items.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <option value={item.id} key={item.id}>{item.name} ({item.widthUnits} × {item.heightUnits})</option>)}</select></label>
      <button type="button" disabled={!selectedSource} onClick={() => { if (selectedSource) add({ id: uid(), kind: 'fixed', name: selectedSource.name, sourceId: selectedSource.id, width: selectedSource.widthUnits, depth: selectedSource.heightUnits }); }}>Add selected bin</button>
    </details>
    <button type="button" onClick={() => add({ id: uid(), name: 'Custom bin', kind: 'parametric', generator: 'basic-cup', width: { min: 0.5, max: 20, step: 0.5 }, depth: { min: 0.5, max: 20, step: 0.5 }, defaults: { height: 4 }, groups: [] })}>Add parametric bin</button>
    {entry && <fieldset key={entry.id}><legend>Configure {entry.name}</legend>
      <label>Bin name<input required value={entry.name} onChange={e => updateEntry({ ...entry, name: e.target.value })} /></label>
      {entry.kind === 'parametric' ? <ParametricEditor entry={entry} onChange={updateEntry} /> : <p>Fixed footprint: {entry.width} × {entry.depth}. Rotated matches are allowed.</p>}
    </fieldset>}
    {errors.length > 0 && <ul className="simple-error" aria-label="Library validation">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
    {error && <p role="alert" className="simple-error">{error}</p>}
    <div className="simple-row"><button disabled={pending || errors.length > 0} type="submit">{pending ? 'Saving…' : 'Save library'}</button><button type="button" disabled={pending} onClick={onCancel}>Cancel editing</button></div>
    {onDelete && (deleteConfirm ? <div><p>Delete this library? Placed bins stay in their layouts.</p><button type="button" disabled={pending} onClick={onDelete}>Confirm delete library</button><button type="button" onClick={() => setDeleteConfirm(false)}>Keep library</button></div> : <button type="button" onClick={() => setDeleteConfirm(true)}>Delete library</button>)}
  </form>;
}
