import type { GeneratorParams, WallCutoutConfig } from './types.js';

export interface WallCutoutParams {
  wallcutout_vertical: string;
  wallcutout_horizontal: string;
}

function mode(first: boolean, second: boolean, firstOnly: string, secondOnly: string): string {
  if (first && second) return 'enabled';
  if (first) return firstOnly;
  return second ? secondOnly : 'disabled';
}

/**
 * Generator cutouts: `vertical` covers the front and back walls, `horizontal` the left and right walls.
 * The generator's left and right are mirrored relative to the customization's.
 */
export function wallCutoutToParams(wc: WallCutoutConfig): WallCutoutParams {
  return {
    wallcutout_vertical: mode(wc.front, wc.back, 'frontonly', 'backonly'),
    wallcutout_horizontal: mode(wc.right, wc.left, 'leftonly', 'rightonly'),
  };
}

/** Inverse of wallCutoutToParams; undefined when the params say nothing about cutouts. */
export function wallCutoutFromParams(params: GeneratorParams): WallCutoutConfig | undefined {
  const vertical = params['wallcutout_vertical'];
  const horizontal = params['wallcutout_horizontal'];
  if (vertical === undefined && horizontal === undefined) return undefined;
  return {
    front: vertical === 'enabled' || vertical === 'frontonly',
    back: vertical === 'enabled' || vertical === 'backonly',
    left: horizontal === 'enabled' || horizontal === 'rightonly',
    right: horizontal === 'enabled' || horizontal === 'leftonly',
  };
}
