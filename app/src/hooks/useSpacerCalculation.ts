import { useMemo } from 'react';
import type { GridSpacerConfig, ComputedSpacer } from '../types/gridfinity';

export function useSpacerCalculation(
  gapWidth: number,
  gapDepth: number,
  config: GridSpacerConfig,
  drawerWidth: number,
  drawerDepth: number
): ComputedSpacer[] {
  return useMemo(() => {
    const spacers: ComputedSpacer[] = [];

    // Handle horizontal spacers
    if (config.horizontal !== 'none' && gapWidth > 0) {
      if (config.horizontal === 'one-sided') {
        // Left spacer only
        spacers.push({
          id: 'spacer-left',
          position: 'left',
          size: gapWidth,
          renderX: 0,
          renderY: 0,
          renderWidth: (gapWidth / drawerWidth) * 100,
          renderHeight: 100,
        });
      } else if (config.horizontal === 'symmetrical') {
        // Split gap between left and right
        const halfGap = gapWidth / 2;
        spacers.push({
          id: 'spacer-left',
          position: 'left',
          size: halfGap,
          renderX: 0,
          renderY: 0,
          renderWidth: (halfGap / drawerWidth) * 100,
          renderHeight: 100,
        });
        spacers.push({
          id: 'spacer-right',
          position: 'right',
          size: halfGap,
          renderX: ((drawerWidth - halfGap) / drawerWidth) * 100,
          renderY: 0,
          renderWidth: (halfGap / drawerWidth) * 100,
          renderHeight: 100,
        });
      }
    }

    // Handle vertical spacers
    if (config.vertical !== 'none' && gapDepth > 0) {
      if (config.vertical === 'one-sided') {
        // Top spacer only
        spacers.push({
          id: 'spacer-top',
          position: 'top',
          size: gapDepth,
          renderX: 0,
          renderY: 0,
          renderWidth: 100,
          renderHeight: (gapDepth / drawerDepth) * 100,
        });
      } else if (config.vertical === 'symmetrical') {
        // Split gap between top and bottom
        const halfGap = gapDepth / 2;
        spacers.push({
          id: 'spacer-top',
          position: 'top',
          size: halfGap,
          renderX: 0,
          renderY: 0,
          renderWidth: 100,
          renderHeight: (halfGap / drawerDepth) * 100,
        });
        spacers.push({
          id: 'spacer-bottom',
          position: 'bottom',
          size: halfGap,
          renderX: 0,
          renderY: ((drawerDepth - halfGap) / drawerDepth) * 100,
          renderWidth: 100,
          renderHeight: (halfGap / drawerDepth) * 100,
        });
      }
    }

    return spacers;
  }, [gapWidth, gapDepth, config, drawerWidth, drawerDepth]);
}
