const CELL = 8;
const PAD = 3;
const DEFAULT_COLOR = '#3B82F6';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{3,8}$/;
function safeColor(c: string): string {
  return HEX_COLOR_RE.test(c) ? c : DEFAULT_COLOR;
}

export interface ThumbnailPlacedItem {
  libraryId: string;
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export function generateThumbnailSvg(
  gridX: number,
  gridY: number,
  items: ThumbnailPlacedItem[],
  colorMap: Map<string, string>,
): string {
  const vw = gridX * CELL + PAD * 2;
  const vh = gridY * CELL + PAD * 2;

  const bgCells: string[] = [];
  for (let row = 0; row < gridY; row++) {
    for (let col = 0; col < gridX; col++) {
      const x = PAD + col * CELL + 1;
      const y = PAD + row * CELL + 1;
      bgCells.push(`<rect x="${x}" y="${y}" width="${CELL - 2}" height="${CELL - 2}" rx="1" fill="#E5E7EB"/>`);
    }
  }

  const itemRects = items.map(item => {
    const color = safeColor(colorMap.get(`${item.libraryId}:${item.itemId}`) ?? DEFAULT_COLOR);
    const sw = item.width * CELL;
    const sh = item.height * CELL;
    const sx = PAD + item.x * CELL;
    const sy = PAD + item.y * CELL;
    return `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="1" fill="${color}" fill-opacity="0.85" stroke="${color}" stroke-width="1"/>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}">${bgCells.join('')}${itemRects.join('')}</svg>`;
}
