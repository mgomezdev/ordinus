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
    if (params.wallpattern_enabled === true) {
      result.wallPatternEnabled = true;
      result.wallPattern = ((params.wallpattern_style ?? 'grid') as WallPattern);
    } else {
      result.wallPatternEnabled = false;
      result.wallPattern = ((params.wallpattern_style ?? 'grid') as WallPattern);
    }
  }

  if (hasField(customizableFields, 'wallCutout') &&
      (params.wallcutout_vertical !== undefined || params.wallcutout_horizontal !== undefined)) {
    const v = (params.wallcutout_vertical as string | undefined) ?? 'disabled';
    const h = (params.wallcutout_horizontal as string | undefined) ?? 'disabled';
    result.wallCutout = {
      front: v === 'frontonly' || v === 'enabled',
      back:  v === 'backonly'  || v === 'enabled',
      left:  h === 'leftonly'  || h === 'enabled',
      right: h === 'rightonly' || h === 'enabled',
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
