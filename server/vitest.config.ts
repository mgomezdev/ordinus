import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@gridfinity/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', '../shared/src/**/*.test.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/db/seed.ts', 'src/db/migrate-cli.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      // Ratchet: raise these as coverage improves; CI fails if coverage drops below.
      thresholds: { statements: 73, branches: 61, functions: 70, lines: 74 },
    },
  },
});
