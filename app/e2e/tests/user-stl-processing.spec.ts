/**
 * Integration tests: upload real STL files, wait for the Python pipeline to process them,
 * then verify image output and dimension detection.
 *
 * Requires a real server with the Python rendering stack installed.
 * Run with: TARGET=docker npm run test:e2e
 *           or: RUN_INTEGRATION_TESTS=1 npm run test:e2e
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ApiUserStl } from '../../shared/src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const BINS_STANDARD_DIR = path.join(REPO_ROOT, 'packages/app/public/libraries/bins_standard');

// bin_2x3 is a 2×3 unit bin — asymmetric enough for meaningful rotation tests
const STL_PATH = path.join(BINS_STANDARD_DIR, 'bin_2x3.stl');

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@gridfinity.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin';

// Ordered mapping: server perspImageUrls are [p0, p90, p180, p270] matching library naming
const IMAGE_MAP: Array<{ refFile: string; label: string }> = [
  { refFile: 'bin_2x3.png',                label: 'orthographic' },
  { refFile: 'bin_2x3-perspective.png',     label: 'perspective-0°' },
  { refFile: 'bin_2x3-perspective-90.png',  label: 'perspective-90°' },
  { refFile: 'bin_2x3-perspective-180.png', label: 'perspective-180°' },
  { refFile: 'bin_2x3-perspective-270.png', label: 'perspective-270°' },
];

// ── Shared helpers ────────────────────────────────────────────────────────────

async function loginAsAdmin(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post('/api/v1/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.status(), 'admin login').toBe(200);
  const { data } = await res.json() as { data: { accessToken: string } };
  return { Authorization: `Bearer ${data.accessToken}` };
}

async function uploadStl(
  request: APIRequestContext,
  auth: Record<string, string>,
  stlBuffer: Buffer,
  uploadFilename: string,
  displayName: string,
): Promise<ApiUserStl> {
  const res = await request.post('/api/v1/user-stls', {
    headers: auth,
    multipart: {
      file: { name: uploadFilename, mimeType: 'model/stl', buffer: stlBuffer },
      name: displayName,
    },
  });
  expect(res.status(), 'upload response').toBe(201);
  return res.json() as Promise<ApiUserStl>;
}

async function pollUntilReady(
  request: APIRequestContext,
  auth: Record<string, string>,
  stlId: string,
  timeoutMs = 90_000,
): Promise<ApiUserStl> {
  let stl: ApiUserStl | undefined;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise<void>(resolve => setTimeout(resolve, 2_000));
    const res = await request.get(`/api/v1/user-stls/${stlId}`, { headers: auth });
    expect(res.status(), 'poll status').toBe(200);
    stl = await res.json() as ApiUserStl;
    if (stl.status === 'ready' || stl.status === 'error') break;
  }
  return stl!;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('User STL processing pipeline', () => {
  test.skip(
    process.env.TARGET !== 'docker' && !process.env.RUN_INTEGRATION_TESTS,
    'Integration test requires full Docker stack — run with TARGET=docker or RUN_INTEGRATION_TESTS=1',
  );

  test('upload bin_2x3.stl and verify all 5 preview images are generated', async ({ request }) => {
    const auth = await loginAsAdmin(request);
    const stlBuffer = await readFile(STL_PATH);
    const uploaded = await uploadStl(request, auth, stlBuffer, 'bin_2x3.stl', 'bin_2x3-e2e');
    const stlId = uploaded.id;

    test.info().annotations.push({ type: 'uploadedStlId', description: stlId });

    const stl = await pollUntilReady(request, auth, stlId);

    expect(
      stl.status,
      `STL processing ended with status '${stl.status}': ${stl.errorMessage ?? ''}`,
    ).toBe('ready');
    expect(stl.imageUrl, 'ortho imageUrl should be set').toBeTruthy();
    expect(stl.perspImageUrls, 'should have 4 perspective images').toHaveLength(4);

    // Verify each generated image is a valid, non-empty PNG.
    // Pixel-exact comparison is intentionally avoided: rendering output varies
    // across platforms (Windows vs. Alpine Linux) due to matplotlib differences.
    // The PNG magic bytes \x89PNG confirm the renderer produced a valid image.
    const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // \x89PNG
    const serverFilenames = [stl.imageUrl!, ...stl.perspImageUrls];
    const labels = IMAGE_MAP.map(m => m.label);

    for (let i = 0; i < serverFilenames.length; i++) {
      const filename = serverFilenames[i];
      const label = labels[i];
      const res = await request.get(`/api/v1/user-stls/${stlId}/images/${filename}`, { headers: auth });
      expect(res.status(), `fetch ${label} image`).toBe(200);
      const buf = Buffer.from(await res.body());
      expect(buf.length, `${label} image should not be empty`).toBeGreaterThan(1000);
      expect(
        buf.subarray(0, 4).equals(PNG_MAGIC),
        `${label} image should be a valid PNG`,
      ).toBe(true);
    }

    await request.delete(`/api/v1/user-stls/${stlId}`, { headers: auth });
  });

  test('dimension detection infers grid size from geometry when filename has no dimension hint', async ({ request }) => {
    // Upload bin_2x3.stl under an opaque filename so the server cannot use the name
    // as a hint — dimensions must come purely from geometry analysis.
    const auth = await loginAsAdmin(request);
    const stlBuffer = await readFile(STL_PATH);
    const uploaded = await uploadStl(request, auth, stlBuffer, 'model.stl', 'dim-detection-e2e');
    const stlId = uploaded.id;

    test.info().annotations.push({ type: 'uploadedStlId', description: stlId });

    const stl = await pollUntilReady(request, auth, stlId);

    expect(
      stl.status,
      `STL processing ended with status '${stl.status}': ${stl.errorMessage ?? ''}`,
    ).toBe('ready');
    expect(stl.gridX, 'gridX should be detected').not.toBeNull();
    expect(stl.gridY, 'gridY should be detected').not.toBeNull();

    const dims = new Set([`${stl.gridX}x${stl.gridY}`, `${stl.gridY}x${stl.gridX}`]);
    expect(
      dims.has('2x3'),
      `detected dimensions ${stl.gridX}x${stl.gridY} should be 2×3 in either orientation`,
    ).toBe(true);

    await request.delete(`/api/v1/user-stls/${stlId}`, { headers: auth });
  });
});
