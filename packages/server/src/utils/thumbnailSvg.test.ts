import { describe, it, expect } from 'vitest';
import { generateThumbnailSvg } from './thumbnailSvg.js';

describe('generateThumbnailSvg', () => {
  it('produces correct viewBox for 3×2 grid', () => {
    // 3*8+6=30, 2*8+6=22
    const svg = generateThumbnailSvg(3, 2, [], new Map());
    expect(svg).toContain('viewBox="0 0 30 22"');
  });

  it('renders gridX*gridY background cells with #E5E7EB fill', () => {
    const svg = generateThumbnailSvg(3, 2, [], new Map());
    const matches = [...svg.matchAll(/fill="#E5E7EB"/g)];
    expect(matches).toHaveLength(6); // 3*2
  });

  it('renders item rect at correct position for 0° rotation', () => {
    // item at x=1, y=0, width=2, height=3, rotation=0
    // SVG x = PAD + 1*CELL = 3 + 8 = 11
    // SVG y = PAD + 0*CELL = 3
    // SVG w = 2*CELL = 16, h = 3*CELL = 24
    const items = [{ libraryId: 'lib1', itemId: 'item1', x: 1, y: 0, width: 2, height: 3, rotation: 0 }];
    const colorMap = new Map([['lib1:item1', '#FF0000']]);
    const svg = generateThumbnailSvg(4, 4, items, colorMap);
    expect(svg).toContain('x="11" y="3" width="16" height="24"');
    expect(svg).toContain('fill="#FF0000"');
  });

  it('swaps width/height for 90° rotation', () => {
    // item at x=0, y=0, width=2, height=3, rotation=90
    // occupies height×width = 3×2 cells
    // SVG x = 3, y = 3, w = 3*8=24, h = 2*8=16
    const items = [{ libraryId: 'lib1', itemId: 'item1', x: 0, y: 0, width: 2, height: 3, rotation: 90 }];
    const colorMap = new Map([['lib1:item1', '#FF0000']]);
    const svg = generateThumbnailSvg(4, 4, items, colorMap);
    expect(svg).toContain('x="3" y="3" width="24" height="16"');
  });

  it('swaps width/height for 270° rotation', () => {
    const items = [{ libraryId: 'lib1', itemId: 'item1', x: 0, y: 0, width: 2, height: 3, rotation: 270 }];
    const colorMap = new Map([['lib1:item1', '#FF0000']]);
    const svg = generateThumbnailSvg(4, 4, items, colorMap);
    expect(svg).toContain('x="3" y="3" width="24" height="16"');
  });

  it('does NOT swap for 180° rotation', () => {
    const items = [{ libraryId: 'lib1', itemId: 'item1', x: 0, y: 0, width: 2, height: 3, rotation: 180 }];
    const colorMap = new Map([['lib1:item1', '#FF0000']]);
    const svg = generateThumbnailSvg(4, 4, items, colorMap);
    expect(svg).toContain('x="3" y="3" width="16" height="24"');
  });

  it('falls back to #3B82F6 when item not in colorMap', () => {
    const items = [{ libraryId: 'lib1', itemId: 'item1', x: 0, y: 0, width: 1, height: 1, rotation: 0 }];
    const svg = generateThumbnailSvg(4, 4, items, new Map());
    expect(svg).toContain('fill="#3B82F6"');
  });

  it('sanitizes malicious color strings to the default color', () => {
    const items = [{ libraryId: 'lib1', itemId: 'item1', x: 0, y: 0, width: 1, height: 1, rotation: 0 }];
    const colorMap = new Map([['lib1:item1', '"/><script>alert(1)</script>']]);
    const svg = generateThumbnailSvg(4, 4, items, colorMap);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain(`fill="${'#3B82F6'}"`);
  });
});
