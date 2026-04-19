import type { GeneratorParams, BinCustomization, CustomizableField, WallPattern, LipStyle, FingerSlide, WallCutout } from '../types/gridfinity';

export function mergeGeneratorParams(...layers: (GeneratorParams | undefined)[]): GeneratorParams {
  return Object.assign({}, ...layers.filter((l): l is GeneratorParams => l !== undefined));
}

export function generatorParamsToBinCustomization(
  params: GeneratorParams,
  customizableFields: CustomizableField[]
): Partial<BinCustomization> {
  const result: Partial<BinCustomization> = {};

  if (customizableFields.includes('lipStyle') && params.lip_style !== undefined) {
    result.lipStyle = params.lip_style as LipStyle;
  }

  if (customizableFields.includes('fingerSlide') && params.fingerslide !== undefined) {
    result.fingerSlide = params.fingerslide as FingerSlide;
  }

  if (customizableFields.includes('wallPattern')) {
    if (params.wallpattern_enabled === true) {
      result.wallPattern = ((params.wallpattern_style ?? 'grid') as WallPattern);
    } else if (params.wallpattern_enabled === false) {
      result.wallPattern = 'none';
    }
  }

  if (customizableFields.includes('wallCutout')) {
    if (params.wallcutout_enabled === false) {
      result.wallCutout = 'none';
    } else if (params.wallcutout_enabled === true) {
      const walls = params.wallcutout_walls as number[] | undefined;
      if (!walls) {
        result.wallCutout = 'none';
      } else if (walls[0] === 1 && walls[1] === 1) {
        result.wallCutout = 'both';
      } else if (walls[0] === 1) {
        result.wallCutout = 'vertical';
      } else if (walls[1] === 1) {
        result.wallCutout = 'horizontal';
      } else {
        result.wallCutout = 'none';
      }
    }
  }

  if (customizableFields.includes('height') && params.height !== undefined) {
    if (Array.isArray(params.height)) {
      result.height = params.height[0] as number;
    } else if (typeof params.height === 'number') {
      result.height = params.height;
    }
  }

  return result;
}
