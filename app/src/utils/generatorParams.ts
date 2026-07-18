import type { GeneratorParams, BinCustomization, CustomizableFieldDef, WallPattern, LipStyle, FingerSlide } from '../types/gridfinity';

export function mergeGeneratorParams(...layers: (GeneratorParams | undefined)[]): GeneratorParams {
  return Object.assign({}, ...layers.filter((l): l is GeneratorParams => l !== undefined));
}

function hasField(fields: CustomizableFieldDef[], name: string): boolean {
  return fields.some(d => d.field === name);
}

export function generatorParamsToBinCustomization(
  params: GeneratorParams,
  customizableFields: CustomizableFieldDef[]
): Partial<BinCustomization> {
  const result: Partial<BinCustomization> = {};

  if (hasField(customizableFields, 'lipStyle') && params.lip_style !== undefined) {
    result.lipStyle = params.lip_style as LipStyle;
  }

  if (hasField(customizableFields, 'fingerSlide') && params.fingerslide !== undefined) {
    result.fingerSlide = params.fingerslide as FingerSlide;
  }

  if ((hasField(customizableFields, 'wallPatternEnabled') || hasField(customizableFields, 'wallPattern')) && params.wallpattern_enabled !== undefined) {
    result.wallPatternEnabled = params.wallpattern_enabled === true;
    result.wallPattern = ((params.wallpattern_style ?? 'grid') as WallPattern);
  }

  if (hasField(customizableFields, 'wallCutout') && params.wallcutout_enabled !== undefined) {
    const walls = (params.wallcutout_walls as number[] | undefined) ?? [0, 0, 0, 0];
    result.wallCutout = {
      front: walls[0] === -2,
      back:  walls[1] === -2,
      left:  walls[2] === -2,
      right: walls[3] === -2,
    };
  }

  if (hasField(customizableFields, 'height') && params.height !== undefined) {
    if (Array.isArray(params.height)) {
      result.height = params.height[0] as number;
    } else if (typeof params.height === 'number') {
      result.height = params.height;
    }
  }

  return result;
}
