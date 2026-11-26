import { lingui } from '@lingui/vite-plugin';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles Lingui macros and `.po` imports the same way Metro does in the app.
  // `failOnMissing`: any untranslated message in a catalog fails the test run.
  plugins: [lingui({ macroTransform: true, failOnMissing: true })],
  // Mirrors `paths` in tsconfig.json; `@/assets/*` is listed first so it wins over `@/*`.
  resolve: {
    alias: [
      { find: /^@\/assets\//, replacement: fileURLToPath(new URL('./assets/', import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
    ],
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
