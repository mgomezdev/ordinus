// Packing can take up to 120s on the Laminus side.
const PACK_TIMEOUT_MS = 150_000;
const MAX_UNIQUE_STLS = 50;
const MAX_TOTAL_COPIES = 500;

// Build plate handed to Laminus' bed-only packing mode (mm).
const BED_X_MM = 255;
const BED_Y_MM = 255;
const BED_Z_MM = 250;

export class LaminusError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LaminusError';
    this.status = status;
  }
}

export interface StlForPacking {
  filename: string;
  bytes: Buffer;
  qty: number;
}

async function laminusPost(url: string, form: FormData): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(PACK_TIMEOUT_MS) });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new LaminusError(`Laminus request failed: ${url}: ${reason}`);
  }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new LaminusError(`Laminus ${resp.status}: POST ${url} ${detail}`.trim(), resp.status);
  }
  return resp;
}

function fileBlob(bytes: Buffer): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
}

/**
 * Combine STLs into one multi-plate 3MF via a single Laminus pack call.
 * Each unique STL is uploaded once with its copy count (`items`). Requires Laminus >= 0.11.0.
 */
export async function buildThreeMfViaLaminus(laminusUrl: string, stls: StlForPacking[]): Promise<Buffer> {
  if (stls.length > MAX_UNIQUE_STLS) {
    throw new LaminusError(`Laminus can pack at most ${MAX_UNIQUE_STLS} unique STLs per request (got ${stls.length})`);
  }
  const totalCopies = stls.reduce((sum, s) => sum + s.qty, 0);
  if (totalCopies > MAX_TOTAL_COPIES) {
    throw new LaminusError(`Laminus can pack at most ${MAX_TOTAL_COPIES} copies per request (got ${totalCopies})`);
  }
  const base = laminusUrl.replace(/\/+$/, '');

  const form = new FormData();
  for (const s of stls) form.append('files', fileBlob(s.bytes), s.filename);
  form.append('items', JSON.stringify(stls.map((s) => ({ file: s.filename, quantity: s.qty }))));
  form.append('bed_x', String(BED_X_MM));
  form.append('bed_y', String(BED_Y_MM));
  form.append('bed_z', String(BED_Z_MM));
  return Buffer.from(await (await laminusPost(`${base}/api/v1/pack`, form)).arrayBuffer());
}
