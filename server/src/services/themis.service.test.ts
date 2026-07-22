import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  uploadStlToThemis,
  createThemisProject,
  addThemisProjectItem,
} from './themis.service.js';

const THEMIS = 'http://localhost:8001';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('uploadStlToThemis', () => {
  it('posts multipart to /api/v1/files/upload and returns file id', async () => {
    global.fetch = mockFetch({ id: 42, original_filename: 'bin_2x3.stl' });
    const result = await uploadStlToThemis(THEMIS, Buffer.from('stl'), 'bin_2x3.stl', '/Gridfinity/my-layout');
    expect(result).toBe(42);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toBe(`${THEMIS}/api/v1/files/upload`);
  });

  it('throws if Themis returns non-ok', async () => {
    global.fetch = mockFetch({ error: { message: 'bad' } }, 422);
    await expect(
      uploadStlToThemis(THEMIS, Buffer.from('stl'), 'bin.stl', '/Gridfinity/x')
    ).rejects.toThrow('422');
  });
});

describe('createThemisProject', () => {
  it('posts to /api/v1/projects and returns project id', async () => {
    global.fetch = mockFetch({ id: 7, name: 'My Layout' });
    const result = await createThemisProject(THEMIS, 'My Layout', 'Imported from Ordinus');
    expect(result).toBe(7);
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${THEMIS}/api/v1/projects`);
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.name).toBe('My Layout');
    expect(body.notes).toBe('Imported from Ordinus');
  });

  it('includes source fields when provided', async () => {
    global.fetch = mockFetch({ id: 7, name: 'My Layout' });
    await createThemisProject(THEMIS, 'My Layout', 'Imported from Ordinus', 'alice', 42);
    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.source_app).toBe('ordinus');
    expect(body.source_user).toBe('alice');
    expect(body.source_layout_id).toBe(42);
  });

  it('throws if Themis returns non-ok', async () => {
    global.fetch = mockFetch({}, 500);
    await expect(createThemisProject(THEMIS, 'X', '')).rejects.toThrow('500');
  });
});

describe('addThemisProjectItem', () => {
  it('posts item to /api/v1/projects/:id/items', async () => {
    global.fetch = mockFetch({ id: 1 });
    await addThemisProjectItem(THEMIS, 7, 42, 3);
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${THEMIS}/api/v1/projects/7/items`);
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body.file_id).toBe(42);
    expect(body.quantity).toBe(3);
    expect(body.filament_profile_uuid).toBe('');
  });

  it('throws if Themis returns non-ok', async () => {
    global.fetch = mockFetch({}, 404);
    await expect(addThemisProjectItem(THEMIS, 7, 99, 1)).rejects.toThrow('404');
  });
});
