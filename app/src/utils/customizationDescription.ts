import type { BinCustomization, WallCutoutConfig } from '../types/gridfinity';
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

function wallCutoutLabel(wc: WallCutoutConfig): string | null {
  const { front, back, left, right } = wc;
  if (!front && !back && !left && !right) return null;
  if (front && back && left && right) return 'Full Cutout';
  const parts: string[] = [];
  if (front && back) parts.push('Front/Back');
  else if (front) parts.push('Front');
  else if (back) parts.push('Back');
  if (left && right) parts.push('Left/Right');
  else if (left) parts.push('Left');
  else if (right) parts.push('Right');
  return `${parts.join('+')} Cutout`;
}

export function formatCustomizationDescription(c: BinCustomization): string {
  const parts: string[] = [];
  if (c.wallPatternEnabled) {
    parts.push(WALL_PATTERN_LABELS[c.wallPattern] ?? c.wallPattern);
  }
  if (c.lipStyle !== DEFAULT_BIN_CUSTOMIZATION.lipStyle) {
    parts.push(LIP_STYLE_LABELS[c.lipStyle] ?? c.lipStyle);
  }
  if (c.fingerSlide !== DEFAULT_BIN_CUSTOMIZATION.fingerSlide) {
    parts.push(FINGER_SLIDE_LABELS[c.fingerSlide] ?? c.fingerSlide);
  }
  const cutoutLabel = wallCutoutLabel(c.wallCutout);
  if (cutoutLabel !== null) {
    parts.push(cutoutLabel);
  }
  if (c.height !== DEFAULT_BIN_CUSTOMIZATION.height) {
    parts.push(`${c.height}u height`);
  }
  return parts.join(' · ');
}
