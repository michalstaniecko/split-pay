import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';
import { createLocalDb, type LocalDb } from './local-db';

/** Opens (creating and migrating if needed) a local database file on the device (expo-sqlite). */
const open = new Map<string, SQLiteDatabase>();

export async function openLocalDb(name: string): Promise<LocalDb> {
  const sqlite = await openDatabaseAsync(name);
  open.set(name, sqlite);
  await sqlite.execAsync('PRAGMA journal_mode = WAL;');
  return createLocalDb({
    all: async (sql, params) => {
      const statement = await sqlite.prepareAsync(sql);
      try {
        const result = await statement.executeForRawResultAsync(params as SQLiteBindValue[]);
        return (await result.getAllAsync()) as unknown[][];
      } finally {
        await statement.finalizeAsync();
      }
    },
    run: async (sql, params) => {
      await sqlite.runAsync(sql, params as SQLiteBindValue[]);
    },
    exec: (sql) => sqlite.execAsync(sql),
  });
}

/** Closes (if open) and deletes a local database file — account deletion. */
export async function deleteLocalDbFile(name: string): Promise<void> {
  const sqlite = open.get(name);
  open.delete(name);
  await sqlite?.closeAsync().catch(() => undefined);
  await deleteDatabaseAsync(name);
}
