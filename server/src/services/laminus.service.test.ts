import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildThreeMfViaLaminus } from './laminus.service.js';

const LAMINUS = 'http://localhost:9000';
const PACKED = Buffer.from('packed');

type Reply = { status?: number; json?: unknown; bytes?: Buffer };

function mockFetch(replies: Reply[]) {
  const fn = vi.fn();
  for (const r of replies) {
    const status = r.status ?? 200;
    fn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(r.json),
      text: () => Promise.resolve('boom'),
      arrayBuffer: () => Promise.resolve(new Uint8Array(r.bytes ?? Buffer.alloc(0)).buffer),
    } as Response);
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const stls = [
  { filename: 'bin_2x3x4.stl', bytes: Buffer.from('a'), qty: 3 },
  { filename: 'bin_1x1x4.stl', bytes: Buffer.from('b'), qty: 1 },
];

beforeEach(() => { vi.restoreAllMocks(); });

describe('buildThreeMfViaLaminus', () => {
  it('sends every unique STL once with its quantity in a single pack call', async () => {
    const fetchMock = mockFetch([{ bytes: PACKED }]);

    const result = await buildThreeMfViaLaminus(LAMINUS, stls);

    expect(result.equals(PACKED)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${LAMINUS}/api/v1/pack`);

    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.getAll('files')).toHaveLength(2);
    expect(JSON.parse(form.get('items') as string)).toEqual([
      { file: 'bin_2x3x4.stl', quantity: 3 },
      { file: 'bin_1x1x4.stl', quantity: 1 },
    ]);
    expect(Number(form.get('bed_x'))).toBeGreaterThan(0);
    expect(Number(form.get('bed_y'))).toBeGreaterThan(0);
    expect(Number(form.get('bed_z'))).toBeGreaterThan(0);
  });

  it('rejects more than 50 unique STLs before calling Laminus', async () => {
    const fetchMock = mockFetch([]);
    const many = Array.from({ length: 51 }, (_, i) => ({ filename: `b${i}.stl`, bytes: Buffer.from('x'), qty: 1 }));
    await expect(buildThreeMfViaLaminus(LAMINUS, many)).rejects.toThrow(/50/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects more than 500 total copies before calling Laminus', async () => {
    const fetchMock = mockFetch([]);
    const heavy = [{ filename: 'a.stl', bytes: Buffer.from('x'), qty: 501 }];
    await expect(buildThreeMfViaLaminus(LAMINUS, heavy)).rejects.toThrow(/500/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws LaminusError with the status when Laminus rejects the call', async () => {
    mockFetch([{ status: 422 }]);
    await expect(buildThreeMfViaLaminus(LAMINUS, stls)).rejects.toMatchObject({ name: 'LaminusError', status: 422 });
  });

  it('strips a trailing slash from the base url', async () => {
    const fetchMock = mockFetch([{ status: 500 }]);
    await buildThreeMfViaLaminus(`${LAMINUS}/`, stls).catch(() => undefined);
    expect(fetchMock.mock.calls[0][0]).toBe(`${LAMINUS}/api/v1/pack`);
  });
});
