import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiAdapter } from './api.adapter';

const BASE = 'http://api.test/api/v1';

function stubRoutes(routes: Record<string, unknown | Response>) {
  const fetchMock = vi.fn(async (url: string) => {
    const hit = routes[url];
    if (hit === undefined) return new Response('not found', { status: 404 });
    return hit instanceof Response ? hit : new Response(JSON.stringify(hit));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const manifest = { libraries: [{ id: 'bins_standard', path: '/libraries/bins_standard/index.json' }] };
const libraryIndex = {
  customizableFields: [{ field: 'lipStyle', type: 'select', options: ['normal', 'none'] }],
  parameters: { lip_style: 'normal', height: 3 },
};

describe('ApiAdapter', () => {
  const adapter = new ApiAdapter(BASE);

  it('maps libraries', async () => {
    stubRoutes({
      [`${BASE}/libraries`]: { data: [{ id: 'bins_standard', name: 'Bins', description: 'd', itemCount: 3, extra: 'x' }] },
    });
    await expect(adapter.getLibraries()).resolves.toEqual([
      { id: 'bins_standard', name: 'Bins', description: 'd', itemCount: 3 },
    ]);
  });

  it('throws when libraries cannot be fetched', async () => {
    stubRoutes({ [`${BASE}/libraries`]: new Response('', { status: 500 }) });
    await expect(adapter.getLibraries()).rejects.toThrow('Failed to fetch libraries');
  });

  it('maps items and layers item params over library defaults', async () => {
    stubRoutes({
      [`${BASE}/libraries/bins_standard/items`]: {
        data: [{
          id: 'bin-1x1', libraryId: 'bins_standard', name: '1x1', widthUnits: 1, heightUnits: 1,
          color: '#fff', categories: ['bin'], stlFile: null, imagePath: 'a.png',
          perspectiveImagePath: 'a-p.png', parameters: { height: 6 }, paramHash: 'abc',
        }],
      },
      '/libraries/manifest.json': manifest,
      '/libraries/bins_standard/index.json': libraryIndex,
    });
    const [item] = await adapter.getLibraryItems('bins_standard');
    expect(item).toMatchObject({
      id: 'bin-1x1',
      stlFile: undefined,
      imageUrl: 'a.png',
      perspectiveImageUrl: 'a-p.png',
      parameters: { lip_style: 'normal', height: 6 },
      paramHash: 'abc',
    });
  });

  it('throws when items cannot be fetched', async () => {
    stubRoutes({});
    await expect(adapter.getLibraryItems('nope')).rejects.toThrow('Failed to fetch items for nope');
  });

  it('reads library meta from the manifest', async () => {
    stubRoutes({
      '/libraries/manifest.json': manifest,
      '/libraries/bins_standard/index.json': libraryIndex,
    });
    await expect(adapter.getLibraryMeta('bins_standard')).resolves.toEqual(libraryIndex);
  });

  it.each([
    ['manifest missing', {}],
    ['library not in manifest', { '/libraries/manifest.json': { libraries: [] } }],
    ['index missing', { '/libraries/manifest.json': manifest }],
    ['manifest not JSON', { '/libraries/manifest.json': new Response('<html>') }],
  ])('falls back to empty meta when %s', async (_label, routes) => {
    stubRoutes(routes);
    await expect(adapter.getLibraryMeta('bins_standard')).resolves.toEqual({ customizableFields: [], parameters: {} });
  });

  it('resolves image urls against the images endpoint unless absolute', () => {
    expect(adapter.resolveImageUrl('lib', 'lib/a.png')).toBe(`${BASE}/images/lib/a.png`);
    expect(adapter.resolveImageUrl('lib', 'https://cdn/x.png')).toBe('https://cdn/x.png');
  });
});
