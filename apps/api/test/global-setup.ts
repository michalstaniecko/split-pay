import { createDb } from '../src/db/client';
import { migrateDatabase } from '../src/db/migrate';
import { testDatabaseUrl } from './env';

/** Brings the test database to the latest migration once per `vitest run`. */
export default async function setup() {
  const { pool } = createDb(testDatabaseUrl());
  try {
    await migrateDatabase(pool, new URL('../drizzle', import.meta.url).pathname);
  } catch (error) {
    throw new Error(
      `Could not migrate the test database. Is Postgres running (\`pnpm db:up\`)?\n${String(error)}`,
      { cause: error },
    );
  } finally {
    await pool.end();
  }
}
