import { defineConfig, devices } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const isDocker = process.env.TARGET === 'docker';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const authDir = resolve(repoRoot, 'app/e2e/.auth');
const baseURL = isDocker ? (process.env.ORDINUS_URL ?? 'http://localhost:32888') : 'http://localhost:5187';
const apiURL = isDocker ? baseURL : 'http://localhost:3017';
if (isDocker && !process.env.ORDINUS_E2E_ADMIN_PASSWORD) throw new Error('Docker E2E requires ORDINUS_E2E_ADMIN_PASSWORD for a separately provisioned test deployment');
process.env.ORDINUS_E2E_ADMIN_PASSWORD ||= randomBytes(24).toString('base64url');
mkdirSync(authDir, { recursive: true });
const passwordFile = resolve(authDir, 'admin-password');
writeFileSync(passwordFile, process.env.ORDINUS_E2E_ADMIN_PASSWORD, { mode: 0o600 });

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !isDocker && !!process.env.CI,
  retries: isDocker ? 1 : (process.env.CI ? 2 : 0),
  workers: isDocker ? 4 : (process.env.CI ? 1 : undefined),
  timeout: isDocker ? 60000 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL,
    storageState: resolve(authDir, 'admin.json'),
    extraHTTPHeaders: { 'X-Ordinus-Request': '1' },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isDocker ? undefined : 'on-first-retry',
    actionTimeout: isDocker ? 15000 : undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: isDocker ? undefined : [
    {
      command: 'npm run dev --workspace=app -- --host localhost --port 5187 --strictPort',
      url: baseURL,
      cwd: repoRoot,
      env: { ORDINUS_API_PROXY_TARGET: apiURL },
      reuseExistingServer: false,
    },
    {
      command: 'npm run server:dev:test',
      url: `${apiURL}/api/v1/health`,
      cwd: repoRoot,
      env: {
        PORT: '3017', DB_PATH: ':memory:', CORS_ORIGIN: baseURL, PUBLIC_URL: baseURL,
        AUTH_COOKIE_SECURE: 'false', ADMIN_SETUP_PASSWORD_FILE: passwordFile,
        IMAGE_DIR: resolve(authDir, 'runtime/images'), USER_STL_DIR: resolve(authDir, 'runtime/user-stls'),
        USER_STL_IMAGE_DIR: resolve(authDir, 'runtime/user-stl-images'), THUMBNAIL_DIR: resolve(authDir, 'runtime/thumbnails'),
        GENERATED_STL_DIR: resolve(authDir, 'runtime/generated'),
      },
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
