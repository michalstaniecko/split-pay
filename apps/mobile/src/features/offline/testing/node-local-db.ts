import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createLocalDb, type LocalDb } from '../local-db';

/** A fresh in-memory local database on Node's built-in SQLite — for tests only (never bundled by Metro). */
export function nodeLocalDb(): Promise<LocalDb> {
  const sqlite = new DatabaseSync(':memory:');
  return createLocalDb({
    all: async (sql, params) => {
      const statement = sqlite.prepare(sql);
      statement.setReturnArrays(true);
      return statement.all(...(params as SQLInputValue[])) as unknown as unknown[][];
    },
    run: async (sql, params) => {
      sqlite.prepare(sql).run(...(params as SQLInputValue[]));
    },
    exec: async (sql) => {
      sqlite.exec(sql);
    },
  });
}
