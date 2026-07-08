// Gridfinity unit sizes (mm)
const GRID_MM = 42;
const HEIGHT_MM = 7;
const TOLERANCE_MM = 5;

function parseBinaryStlBounds(buf: Buffer): [number, number, number] | null {
  if (buf.length < 84) return null;
  const triCount = buf.readUInt32LE(80);
  if (buf.length < 84 + triCount * 50) return null;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < triCount; i++) {
    const base = 84 + i * 50 + 12; // skip normal vector
    for (let v = 0; v < 3; v++) {
      const b = base + v * 12;
      const x = buf.readFloatLE(b);
      const y = buf.readFloatLE(b + 4);
      const z = buf.readFloatLE(b + 8);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }

  return [maxX - minX, maxY - minY, maxZ - minZ];
}

// Returns an error string on failure, null on success.
// Sorts both actual and expected dims before comparing to handle any STL orientation.
export function validateStlDimensions(
  buf: Buffer,
  gridX: number,
  gridY: number,
  gridZ: number,
): string | null {
  const bounds = parseBinaryStlBounds(buf);
  if (!bounds) return 'Could not parse STL file — must be binary STL format.';

  const actual = [...bounds].sort((a, b) => a - b);
  const expected = [gridX * GRID_MM, gridY * GRID_MM, gridZ * HEIGHT_MM].sort((a, b) => a - b);

  for (let i = 0; i < 3; i++) {
    if (Math.abs(actual[i] - expected[i]) > TOLERANCE_MM) {
      const ae = expected.map(n => n.toFixed(0)).join('×');
      const aa = actual.map(n => n.toFixed(1)).join('×');
      return `Dimension mismatch: declared ~${ae}mm but measured ~${aa}mm (tolerance ±${TOLERANCE_MM}mm).`;
    }
  }

  return null;
}
