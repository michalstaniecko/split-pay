import { lingui } from '@lingui/vite-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles Lingui macros and `.po` imports the same way Metro does in the app.
  // `failOnMissing`: any untranslated message in a catalog fails the test run.
  plugins: [lingui({ macroTransform: true, failOnMissing: true })],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
