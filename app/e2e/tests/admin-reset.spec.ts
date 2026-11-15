import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';

test.use({ storageState: { cookies: [], origins: [] }, trace: 'off', video: 'off', screenshot: 'off' });

test('log-code reset is single-use, revokes existing sessions, and survives restart in an isolated deployment', async ({ browser, baseURL, playwright }) => {
  test.skip(process.env.TARGET === 'docker', 'This test launches its own disposable local API');
  test.setTimeout(90_000);
  const directory = await mkdtemp(join(tmpdir(), 'ordinus-auth-e2e-'));
  const passwordFile = join(directory, 'admin-password');
  const password = randomBytes(24).toString('base64url');
  const replacement = randomBytes(24).toString('base64url');
  await writeFile(passwordFile, password, { mode: 0o600 });
  const serverDir = fileURLToPath(new URL('../../../server', import.meta.url));
  const apiURL = 'http://localhost:3018';
  let child: ChildProcess | undefined;
  let log = '';
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  async function start() {
    child = spawn(process.execPath, ['--import', 'tsx/esm', 'src/index.ts'], {
      cwd: serverDir, windowsHide: true,
      env: {
        ...process.env, NODE_ENV: 'test', PORT: '3018', LOG_LEVEL: 'warn', AUTH_COOKIE_SECURE: 'false',
        CORS_ORIGIN: baseURL!, PUBLIC_URL: baseURL!, DB_PATH: join(directory, 'db.sqlite'),
        ADMIN_SETUP_PASSWORD_FILE: passwordFile, IMAGE_DIR: join(directory, 'images'),
        USER_STL_DIR: join(directory, 'stls'), USER_STL_IMAGE_DIR: join(directory, 'stl-images'),
        THUMBNAIL_DIR: join(directory, 'thumbnails'), GENERATED_STL_DIR: join(directory, 'generated'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout!.on('data', chunk => { log += String(chunk); });
    // Do not attach raw server logs (which contain reset codes) to test reports.
    child.stderr!.on('data', () => {});
    await expect.poll(async () => {
      try { return (await fetch(`${apiURL}/api/v1/health`)).status; } catch { return 0; }
    }, { timeout: 25_000, message: 'Isolated reset server starts' }).toBe(200);
  }
  const api = await playwright.request.newContext({ baseURL: apiURL, extraHTTPHeaders: { 'X-Ordinus-Request': '1' } });
  const context = await browser.newContext({ baseURL });
  try {
    await start();
    expect((await api.post('/api/v1/auth/login', { data: { username: 'admin', password } })).status()).toBe(200);
    const saved = await api.post('/api/v1/layouts', { data: { name: 'Survives password reset', gridX: 4, gridY: 2, widthMm: 168, depthMm: 84, placedItems: [] } });
    expect(saved.status()).toBe(201);
    await context.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url());
      // Forward directly so streaming responses are not buffered by route.fetch.
      await route.continue({ url: `${apiURL}${url.pathname}${url.search}` });
    });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Reset admin password' }).click();
    await page.getByRole('button', { name: 'Request reset code' }).click();
    await expect(page.getByLabel('Reset code')).toBeVisible();
    const event = log.split(/\r?\n/).map(line => { try { return JSON.parse(line) as { event?: string; requestId: string; resetCode: string }; } catch { return null; } }).find(entry => entry?.event === 'admin_password_reset_code');
    if (!event) throw new Error('Reset delivery event missing from server logs');
    expect((await api.get('/api/v1/layouts')).status()).toBe(200);
    await page.getByLabel('Reset code').fill(event.resetCode);
    await page.getByLabel('New password', { exact: true }).fill(replacement);
    await page.getByLabel('Confirm password').fill(replacement);
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Password reset');
    expect((await api.get('/api/v1/layouts')).status()).toBe(401);
    expect((await api.post('/api/v1/auth/reset/complete', { data: { requestId: event.requestId, code: event.resetCode, password } })).status()).toBe(400);
    await stop(); await start();
    expect((await api.get('/api/v1/layouts')).status()).toBe(401);
    expect((await api.post('/api/v1/auth/login', { data: { username: 'admin', password } })).status()).toBe(401);
    await page.getByLabel('Password', { exact: true }).fill(replacement);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    const current = await page.request.get(`${apiURL}/api/v1/layouts`);
    expect(current.status()).toBe(200);
    expect((await current.json() as { data: { name: string }[] }).data.some(layout => layout.name === 'Survives password reset')).toBe(true);
  } finally {
    await context.close(); await api.dispose(); await stop();
    // directory is the exact mkdtemp-created test directory, never a configured path.
    await rm(resolve(directory), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
