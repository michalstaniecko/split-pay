/** Set by vitest.config.ts (defaults to the compose.yaml Postgres). */
export const testDatabaseUrl = () =>
  process.env.TEST_DATABASE_URL ?? 'postgres://splitpay:splitpay@localhost:5432/splitpay_test';
