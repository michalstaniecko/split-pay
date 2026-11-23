import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  format: 'esm',
  // Pakiety workspace są źródłami TS — wbudowujemy je w bundle.
  noExternal: [/^@split-pay\//],
});
