/**
 * GridDimensionsContext
 *
 * Focused context for drawer dimensions, unit system, and derived grid values.
 * Consumers that only need grid/dimension data should prefer `useGridDimensions`
 * over the broader `useWorkspace` hook.
 *
 * This context is backed by `WorkspaceContext` — it is not a separate provider.
 * It re-reads the same underlying context and exposes a narrowed slice.
 */
import { createContext, useContext } from 'react';
import type { UnitSystem, ImperialFormat, GridSpacerConfig, GridResult, ComputedSpacer } from '../types/gridfinity';

export interface GridDimensionsContextValue {
  // Drawer dimensions (in current unit system)
  width: number;
  setWidth: (w: number) => void;
  depth: number;
  setDepth: (d: number) => void;

  // Unit system
  unitSystem: UnitSystem;
  setUnitSystem: (u: UnitSystem) => void;
  imperialFormat: ImperialFormat;
  setImperialFormat: (f: ImperialFormat) => void;

  // Spacer configuration
  spacerConfig: GridSpacerConfig;
  setSpacerConfig: (c: GridSpacerConfig) => void;

  // Handles unit conversion on change
  handleUnitChange: (newUnit: UnitSystem) => void;

  // Derived grid results
  gridResult: GridResult;
  drawerWidth: number;
  drawerDepth: number;
  spacers: ComputedSpacer[];
}

export const GridDimensionsContext = createContext<GridDimensionsContextValue | null>(null);

export function useGridDimensions(): GridDimensionsContextValue {
  const ctx = useContext(GridDimensionsContext);
  if (!ctx) throw new Error('useGridDimensions must be used within WorkspaceProvider');
  return ctx;
}
