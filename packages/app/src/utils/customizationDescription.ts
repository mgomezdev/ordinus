import type { BinCustomization } from '../types/gridfinity';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';

const WALL_PATTERN_LABELS: Record<string, string> = {
  grid: 'Grid Wall',
  hexgrid: 'Hex Wall',
  voronoi: 'Voronoi Wall',
  voronoigrid: 'Voronoi Grid Wall',
  voronoihexgrid: 'Voronoi Hex Wall',
};

const LIP_STYLE_LABELS: Record<string, string> = {
  reduced: 'Reduced Lip',
  minimum: 'Minimum Lip',
  none: 'No Lip',
};

const FINGER_SLIDE_LABELS: Record<string, string> = {
  rounded: 'Rounded Finger Slide',
  chamfered: 'Chamfered Finger Slide',
};

const WALL_CUTOUT_LABELS: Record<string, string> = {
  vertical: 'Vertical Cutout',
  horizontal: 'Horizontal Cutout',
  both: 'Full Cutout',
};

export function formatCustomizationDescription(c: BinCustomization): string {
  const parts: string[] = [];
  if (c.wallPattern !== DEFAULT_BIN_CUSTOMIZATION.wallPattern) {
    parts.push(WALL_PATTERN_LABELS[c.wallPattern] ?? c.wallPattern);
  }
  if (c.lipStyle !== DEFAULT_BIN_CUSTOMIZATION.lipStyle) {
    parts.push(LIP_STYLE_LABELS[c.lipStyle] ?? c.lipStyle);
  }
  if (c.fingerSlide !== DEFAULT_BIN_CUSTOMIZATION.fingerSlide) {
    parts.push(FINGER_SLIDE_LABELS[c.fingerSlide] ?? c.fingerSlide);
  }
  if (c.wallCutout !== DEFAULT_BIN_CUSTOMIZATION.wallCutout) {
    parts.push(WALL_CUTOUT_LABELS[c.wallCutout] ?? c.wallCutout);
  }
  if (c.height !== DEFAULT_BIN_CUSTOMIZATION.height) {
    parts.push(`${c.height}u height`);
  }
  return parts.join(' · ');
}
