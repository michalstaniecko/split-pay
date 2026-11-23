import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  // UI copy is Polish-first (docs/SPEC.md → Language).
  sourceLocale: 'pl',
  locales: ['pl', 'en'],
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src'],
      exclude: ['**/*.test.ts'],
    },
  ],
  // No line numbers in origins: fewer merge conflicts when tickets touch the same catalogs.
  format: formatter({ lineNumbers: false }),
});
