import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../test/env';
import { migrateDatabase } from './migrate';

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;
const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as { entries: unknown[] };

// A fresh database per run, next to the test database (that one is migrated by global-setup.ts).
const name = `splitpay_migrate_${process.pid}_${Date.now()}`;
const freshUrl = (() => {
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${name}`;
  return url.toString();
})();
const admin = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
let fresh: Pool | undefined;

beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${name}"`);
  fresh = new Pool({ connectionString: freshUrl });
});

afterAll(async () => {
  await fresh?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

const freshPool = () => {
  if (!fresh) throw new Error('fresh database not created');
  return fresh;
};

const appliedMigrations = async () =>
  Number((await freshPool().query<{ count: string }>('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0]?.count);

describe('migrateDatabase', () => {
  it('migrates a fresh database, even when two instances start at once', async () => {
    await Promise.all([migrateDatabase(freshPool(), migrationsFolder), migrateDatabase(freshPool(), migrationsFolder)]);

    expect(await appliedMigrations()).toBe(journal.entries.length);
    const { rows } = await freshPool().query(
      `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'groups'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('is a no-op on a second start', async () => {
    await migrateDatabase(freshPool(), migrationsFolder);

    expect(await appliedMigrations()).toBe(journal.entries.length);
  });

  it('fails loudly when the migrations cannot be read', async () => {
    await expect(migrateDatabase(freshPool(), '/nonexistent/drizzle')).rejects.toThrow();
  });
});
