import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Migrates the test database once per run.
    globalSetup: ['./test/global-setup.ts'],
    // Truncates every table before each test.
    setupFiles: ['./test/setup.ts'],
    // One shared test database → test files run one after another.
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://splitpay:splitpay@localhost:5432/splitpay_test',
    },
  },
});
