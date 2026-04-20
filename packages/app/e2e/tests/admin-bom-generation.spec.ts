/**
 * E2E security tests for the admin BOM generation endpoints.
 *
 * These tests make direct HTTP requests (no browser) to verify that the
 * generate, status, and file-download endpoints enforce authentication and
 * admin-only access control.
 *
 * Requires a real server with the full stack running.
 * Run with: TARGET=docker npm run test:e2e
 *           or: RUN_INTEGRATION_TESTS=1 npm run test:e2e
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

// ── Credentials ───────────────────────────────────────────────────────────────

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@gridfinity.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin';

const USER_EMAIL = process.env.E2E_USER_EMAIL ?? 'test@gridfinity.local';
const USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'test123';

// A placeholder submission ID — used for security checks only.
// The server should reject unauthenticated / non-admin callers before
// looking up the record, so the ID itself does not need to exist.
const FAKE_SUBMISSION_ID = 999999;

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string,
  label: string,
): Promise<Record<string, string>> {
  const res = await request.post('/api/v1/auth/login', {
    data: { email, password },
  });
  expect(res.status(), `${label} login`).toBe(200);
  const { data } = await res.json() as { data: { accessToken: string } };
  return { Authorization: `Bearer ${data.accessToken}` };
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Admin BOM generation — security', () => {
  test.skip(
    process.env.TARGET !== 'docker' && !process.env.RUN_INTEGRATION_TESTS,
    'Integration test requires full Docker stack — run with TARGET=docker or RUN_INTEGRATION_TESTS=1',
  );

  // ── POST /admin/bom/:id/generate ────────────────────────────────────────────

  test('unauthenticated generate returns 401', async ({ request }) => {
    const res = await request.post(`/api/v1/admin/bom/${FAKE_SUBMISSION_ID}/generate`);
    expect(res.status()).toBe(401);
  });

  test('non-admin generate returns 403', async ({ request }) => {
    const auth = await loginAs(request, USER_EMAIL, USER_PASSWORD, 'regular user');
    const res = await request.post(`/api/v1/admin/bom/${FAKE_SUBMISSION_ID}/generate`, {
      headers: auth,
    });
    expect(res.status()).toBe(403);
  });

  // ── GET /admin/bom/:id/generation ───────────────────────────────────────────

  test('unauthenticated generation status returns 401', async ({ request }) => {
    const res = await request.get(`/api/v1/admin/bom/${FAKE_SUBMISSION_ID}/generation`);
    expect(res.status()).toBe(401);
  });

  test('non-admin generation status returns 403', async ({ request }) => {
    const auth = await loginAs(request, USER_EMAIL, USER_PASSWORD, 'regular user');
    const res = await request.get(`/api/v1/admin/bom/${FAKE_SUBMISSION_ID}/generation`, {
      headers: auth,
    });
    expect(res.status()).toBe(403);
  });

  // ── GET /admin/bom/:id/files/:filename ──────────────────────────────────────

  test('unauthenticated file download returns 401', async ({ request }) => {
    const res = await request.get(
      `/api/v1/admin/bom/${FAKE_SUBMISSION_ID}/files/bom.3mf`,
    );
    expect(res.status()).toBe(401);
  });

  test('non-admin file download returns 403', async ({ request }) => {
    const auth = await loginAs(request, USER_EMAIL, USER_PASSWORD, 'regular user');
    const res = await request.get(
      `/api/v1/admin/bom/${FAKE_SUBMISSION_ID}/files/bom.3mf`,
      { headers: auth },
    );
    expect(res.status()).toBe(403);
  });

  // ── Smoke: admin can reach the generate endpoint ────────────────────────────

  test('admin generate with unknown submission returns 4xx (not 401/403)', async ({ request }) => {
    // This confirms the admin is allowed past the auth gates.
    // The non-existent submission ID will cause a 404 (or 400/500 depending on
    // service behaviour) — any response other than 401/403 proves access was granted.
    const auth = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD, 'admin');
    const res = await request.post(`/api/v1/admin/bom/${FAKE_SUBMISSION_ID}/generate`, {
      headers: auth,
    });
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });
});

// ── UI visibility tests (skipped — require submitted BOM in DB) ───────────────
//
// These tests would verify that:
//   1. An admin user sees the "Admin BOM Generation" panel on the Order Summary page
//      when a BOM submission exists.
//   2. A regular user never sees the admin panel, even with a submission present.
//
// They are skipped here because they require:
//   - A real BOM submission to be created first (POST /api/v1/bom/submit with a
//     placed-items payload), which itself needs a running server with seeded data.
//   - The frontend to be served at baseURL so the React router and auth context
//     are available.
//
// To implement when full integration infrastructure is available:
//   - Submit a BOM as a regular user, capture the submission ID.
//   - Log in as admin in the browser, navigate to Order Summary, assert the admin
//     panel is visible and contains the submission.
//   - Log in as a regular user, navigate to Order Summary, assert the admin panel
//     is NOT in the DOM.

test.skip('admin sees AdminBomPanel on Order Summary when a submission exists', () => {});
test.skip('regular user does not see AdminBomPanel on Order Summary', () => {});
