import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/db/client';
import { testDatabaseUrl } from './env';

/** Brings the test database to the latest migration once per `vitest run`. */
export default async function setup() {
  const { db, pool } = createDb(testDatabaseUrl());
  try {
    await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
  } catch (error) {
    throw new Error(
      `Could not migrate the test database. Is Postgres running (\`pnpm db:up\`)?\n${String(error)}`,
      { cause: error },
    );
  } finally {
    await pool.end();
  }
}
