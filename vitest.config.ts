import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose: that config loads the Electron
// plugins, which would try to build the main process during a unit test run.
export default defineConfig({
  test: {
    // Node by default. A component test opts into a DOM per file with `// @vitest-environment jsdom`.
    environment: 'node',
    include: [
      'api/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'web/src/**/*.test.ts',
      'web/src/**/*.test.tsx',
      'electron/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    // Measured, not gated: `npm run test:coverage` writes a text summary and lcov to coverage/.
    // No threshold yet; the first job is to see where the untested code is.
    coverage: {
      provider: 'v8',
      // json-summary feeds the CI job summary (.github/workflows/verify.yml).
      reporter: ['text-summary', 'text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts', 'api/**/*.ts', 'scripts/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**', '**/*.d.ts', 'src/types/supabase.ts', '**/dist/**'],
    },
  },
  // Mirrors the alias in vite.config.js. Without it any module under test that
  // imports through '@/' fails to resolve, which rules out most of src.
  resolve: {
    alias: {
      '@web': resolve(__dirname, 'web/src'),
      '@': resolve(__dirname, 'src'),
    },
  },
})
