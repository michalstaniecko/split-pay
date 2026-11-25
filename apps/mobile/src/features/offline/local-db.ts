import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { localSchema } from './local-schema';

/**
 * The few calls the local database needs from a SQLite driver. The app
 * implements it with expo-sqlite (`open-local-db.ts`), tests with Node's
 * built-in `node:sqlite` — the same Drizzle code runs on both.
 */
export interface SqlExecutor {
  /** Rows as arrays of column values, in select order. */
  all(sql: string, params: unknown[]): Promise<unknown[][]>;
  run(sql: string, params: unknown[]): Promise<void>;
  /** Runs a script of several statements (migrations). */
  exec(sql: string): Promise<void>;
}

export type LocalDb = SqliteRemoteDatabase<typeof localSchema>;

/**
 * Schema versions, applied in order and tracked with `PRAGMA user_version`.
 * Append only — never edit a shipped step (phones already ran it). Keep
 * `local-schema.ts` in sync (snake_case columns).
 */
export const LOCAL_MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE groups (
    id TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL,
    last_entry TEXT,
    last_activity_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cursor TEXT,
    synced_at TEXT,
    synced_activity_at TEXT
  );
  CREATE TABLE members (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX members_group_id_idx ON members (group_id, position);
  CREATE TABLE entries (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    title TEXT,
    data TEXT NOT NULL
  );
  CREATE INDEX entries_group_id_date_idx ON entries (group_id, date, created_at);
  CREATE TABLE outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    group_id TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    change TEXT NOT NULL,
    payload TEXT,
    base_version INTEGER,
    status TEXT NOT NULL,
    error TEXT,
    current TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX outbox_entry_id_idx ON outbox (entry_id);
  `,
  `
  ALTER TABLE groups ADD COLUMN last_entry_by_others_at TEXT;
  `,
  `
  ALTER TABLE groups ADD COLUMN local INTEGER NOT NULL DEFAULT 0;
  `,
];

/**
 * Wraps a driver as the app's Drizzle database, after bringing its schema up
 * to date. Statements run one at a time (a single SQLite connection must not
 * interleave a batch's transaction with other queries); `db.batch([...])` is
 * atomic. Don't use `db.transaction` — use `batch`.
 */
export async function createLocalDb(executor: SqlExecutor): Promise<LocalDb> {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  };

  type Method = 'run' | 'all' | 'values' | 'get';
  const execute = async (sql: string, params: unknown[], method: Method): Promise<{ rows: unknown[] }> => {
    if (method === 'run') {
      await executor.run(sql, params);
      return { rows: [] };
    }
    const rows = await executor.all(sql, params);
    return { rows: method === 'get' ? (rows[0] as unknown[]) : rows };
  };

  await serial(() => migrate(executor));

  return drizzle(
    (sql, params, method) => serial(() => execute(sql, params, method)),
    (queries) =>
      serial(async () => {
        await executor.exec('BEGIN');
        try {
          const results = [];
          for (const q of queries) results.push(await execute(q.sql, q.params, q.method));
          await executor.exec('COMMIT');
          return results;
        } catch (error) {
          await executor.exec('ROLLBACK');
          throw error;
        }
      }),
    { schema: localSchema, casing: 'snake_case' },
  );
}

async function migrate(executor: SqlExecutor): Promise<void> {
  const [row] = await executor.all('PRAGMA user_version', []);
  const version = Number(row?.[0] ?? 0);
  for (let next = version; next < LOCAL_MIGRATIONS.length; next++) {
    try {
      await executor.exec(`BEGIN; ${LOCAL_MIGRATIONS[next]}; PRAGMA user_version = ${next + 1}; COMMIT;`);
    } catch (error) {
      await executor.exec('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
}
