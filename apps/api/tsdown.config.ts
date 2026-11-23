import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  format: 'esm',
  // Workspace packages ship TS sources — bundle them in.
  noExternal: [/^@split-pay\//],
});
