import { defineConfig, devices } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const isDocker = process.env.TARGET === 'docker';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !isDocker && !!process.env.CI,
  retries: isDocker ? 1 : (process.env.CI ? 2 : 0),
  workers: isDocker ? 4 : (process.env.CI ? 1 : undefined),
  timeout: isDocker ? 60000 : undefined,
  reporter: 'html',
  globalSetup: isDocker ? undefined : './e2e/global-setup.ts',

  use: {
    baseURL: isDocker ? 'http://localhost:32888' : 'http://localhost:5173',
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
      command: 'npm run dev',
      url: 'http://localhost:5173',
      cwd: repoRoot,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run server:dev:test',
      url: 'http://localhost:3001/api/v1/health',
      cwd: repoRoot,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
