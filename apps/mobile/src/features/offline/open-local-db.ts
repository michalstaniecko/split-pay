import { openDatabaseAsync, type SQLiteBindValue } from 'expo-sqlite';
import { createLocalDb, type LocalDb } from './local-db';

/** Opens (creating and migrating if needed) a local database file on the device (expo-sqlite). */
export async function openLocalDb(name: string): Promise<LocalDb> {
  const sqlite = await openDatabaseAsync(name);
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
