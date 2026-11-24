import { sql } from 'drizzle-orm';
import { createDb } from '../src/db/client';
import { testDatabaseUrl } from './env';

/** One pool per test file (vitest isolates modules per file); closed in setup.ts. */
export const testDb = createDb(testDatabaseUrl());

/** Empties every table in `public`; migration history lives in the `drizzle` schema. */
export async function truncateAll() {
  const { rows } = await testDb.pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await testDb.db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
}
