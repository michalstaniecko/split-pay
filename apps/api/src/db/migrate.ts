import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

/** Advisory lock key shared by every API instance (any constant works; this one is readable). */
const LOCK_KEY = "hashtext('split-pay:migrations')";

/**
 * Applies pending migrations from `migrationsFolder` (the drizzle-kit output, `apps/api/drizzle/`).
 * Drizzle's migrator takes no lock, so it runs under a session-level Postgres advisory
 * lock: when several instances start at once, one migrates and the others wait, then
 * find nothing left to apply. Throws if a migration fails; the API must not start then.
 */
export async function migrateDatabase(pool: Pool, migrationsFolder: string): Promise<void> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query(`SELECT pg_advisory_lock(${LOCK_KEY})`);
    try {
      await migrate(drizzle({ client, casing: 'snake_case' }), { migrationsFolder });
    } finally {
      await client.query(`SELECT pg_advisory_unlock(${LOCK_KEY})`);
    }
  } catch (error) {
    // Drop the connection rather than return it to the pool in an unknown state.
    broken = error instanceof Error ? error : new Error(String(error));
    throw error;
  } finally {
    client.release(broken);
  }
}
