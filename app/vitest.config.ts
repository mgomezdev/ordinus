import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@gridfinity/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      // Ratchet: raise these as coverage improves; CI fails if coverage drops below.
      thresholds: {
        statements: 77, branches: 71, functions: 72, lines: 81,
        'src/hooks/useLiveLayout.ts': { statements: 83, branches: 70, functions: 80, lines: 95 },
        'src/hooks/useWorkspaceLiveSync.ts': { statements: 78, branches: 64, functions: 80, lines: 90 },
        'src/components/layouts/GuestLinkPanel.tsx': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
})
