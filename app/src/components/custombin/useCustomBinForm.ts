import { useCallback, useMemo, useState } from 'react';
import {
  CUSTOM_BIN_MAX,
  CUSTOM_BIN_MIN,
  GENERATOR_PARAM_SCHEMA,
  effectiveDefault,
  isParamEnabled,
  pruneOverrides,
  validateCustomBinSpec,
} from '@gridfinity/shared';
import type { CustomBinSpec, ParamGroup } from '@gridfinity/shared';
import { snapToHalf } from '../../utils/snap';

export type SizeAxis = 'width' | 'depth' | 'height';

const DEFAULT_SPEC: CustomBinSpec = { width: 2, depth: 1, height: 4, overrides: {} };

const DEFS_BY_NAME = new Map(GENERATOR_PARAM_SCHEMA.map(d => [d.name, d]));

function clampSize(value: number): number {
  return Math.max(CUSTOM_BIN_MIN, Math.min(CUSTOM_BIN_MAX, snapToHalf(value)));
}

/** Overrides whose enabling parameter is off cannot apply, so they are removed. */
function dropDisabled(overrides: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([name]) => {
      const def = DEFS_BY_NAME.get(name);
      return !def || isParamEnabled(def, overrides);
    }),
  );
}

export function useCustomBinForm(initial?: CustomBinSpec) {
  const [spec, setSpec] = useState<CustomBinSpec>(() => ({
    ...(initial ?? DEFAULT_SPEC),
    overrides: { ...(initial?.overrides ?? {}) },
  }));

  const setSize = useCallback((axis: SizeAxis, value: number) => {
    if (!Number.isFinite(value)) return;
    setSpec(prev => ({ ...prev, [axis]: clampSize(value) }));
  }, []);

  const setOverride = useCallback((name: string, value: unknown) => {
    setSpec(prev => ({
      ...prev,
      overrides: dropDisabled(pruneOverrides({ ...prev.overrides, [name]: value })),
    }));
  }, []);

  const resetOverride = useCallback((name: string) => {
    setSpec(prev => {
      const rest = Object.fromEntries(Object.entries(prev.overrides).filter(([key]) => key !== name));
      return { ...prev, overrides: dropDisabled(rest) };
    });
  }, []);

  const resetAll = useCallback(() => {
    setSpec(prev => ({ ...prev, overrides: {} }));
  }, []);

  const isOverridden = useCallback(
    (name: string) => Object.prototype.hasOwnProperty.call(spec.overrides, name),
    [spec.overrides],
  );

  const valueOf = useCallback((name: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(spec.overrides, name)) return spec.overrides[name];
    const def = DEFS_BY_NAME.get(name);
    return def ? effectiveDefault(def) : undefined;
  }, [spec.overrides]);

  const isEnabled = useCallback((name: string) => {
    const def = DEFS_BY_NAME.get(name);
    return def ? isParamEnabled(def, spec.overrides) : false;
  }, [spec.overrides]);

  const overrideCount = useCallback((group?: ParamGroup) => (
    Object.keys(spec.overrides).filter(name => !group || DEFS_BY_NAME.get(name)?.group === group).length
  ), [spec.overrides]);

  const errors = useMemo(() => {
    const result = validateCustomBinSpec(spec);
    return result.ok ? [] : result.errors;
  }, [spec]);

  return { spec, setSize, setOverride, resetOverride, resetAll, isOverridden, valueOf, isEnabled, overrideCount, errors };
}
