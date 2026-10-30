import { useRef, useEffect, useState } from 'react';
import { GENERATOR_PARAM_SCHEMA } from '@gridfinity/shared';
import type { CustomBinSpec, ParamDef, ParamGroup } from '@gridfinity/shared';
import { SizeInputs } from './SizeInputs';
import { ParamField } from './ParamField';
import { useCustomBinForm } from './useCustomBinForm';
import './custombin.css';

const PARAMS_BY_GROUP = GENERATOR_PARAM_SCHEMA.reduce((map, def) => {
  map.set(def.group, [...(map.get(def.group) ?? []), def]);
  return map;
}, new Map<ParamGroup, ParamDef[]>());

interface CustomBinDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (spec: CustomBinSpec) => void;
  initial?: CustomBinSpec;
  /** Label of the confirm button; editing an existing bin says "Update" instead of "Add to layout". */
  confirmLabel?: string;
}

export function CustomBinDialog({ open, onClose, onAdd, initial, confirmLabel = 'Add to layout' }: CustomBinDialogProps) {
  if (!open) return null;
  return <CustomBinDialogBody onClose={onClose} onAdd={onAdd} initial={initial} confirmLabel={confirmLabel} />;
}

type BodyProps = Omit<CustomBinDialogProps, 'open'> & { confirmLabel: string };

function CustomBinDialogBody({ onClose, onAdd, initial, confirmLabel }: BodyProps) {
  const form = useCustomBinForm(initial);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const { spec } = form;
  const total = form.overrideCount();

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleResetAll = () => {
    form.resetAll();
    setResetKey(key => key + 1);
  };

  return (
    <div className="custom-bin-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="custom-bin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-bin-title"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      >
        <h2 id="custom-bin-title" className="custom-bin-title">Custom bin</h2>
        <SizeInputs width={spec.width} depth={spec.depth} height={spec.height} onChange={form.setSize} />
        <div className="custom-bin-groups">
          {[...PARAMS_BY_GROUP.entries()].map(([group, defs]) => (
            <details key={group} className="custom-bin-group">
              <summary>
                <span>{group}</span>
                {form.overrideCount(group) > 0 && (
                  <span className="custom-bin-badge" data-testid={`group-count-${group}`}>{form.overrideCount(group)}</span>
                )}
                {form.overrideCount(group) === 0 && <span data-testid={`group-count-${group}`} hidden>0</span>}
              </summary>
              {defs.map(def => <ParamField key={`${def.name}-${resetKey}`} def={def} form={form} />)}
            </details>
          ))}
        </div>
        {form.errors.length > 0 && (
          <ul className="custom-bin-errors" role="alert">
            {form.errors.map(error => <li key={error}>{error}</li>)}
          </ul>
        )}
        <div className="custom-bin-actions">
          <button type="button" onClick={handleResetAll} disabled={total === 0}>Reset all</button>
          <span data-testid="overrides-summary" className="custom-bin-summary">
            {total === 0 ? 'No overrides' : `${total} override${total === 1 ? '' : 's'}`}
          </span>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="custom-bin-add" disabled={form.errors.length > 0} onClick={() => onAdd(spec)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
