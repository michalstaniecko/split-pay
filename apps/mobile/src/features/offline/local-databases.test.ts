import { describe, expect, it } from 'vitest';
import type { LocalDb } from './local-db';
import { type LocalDbFiles, createLocalDatabases } from './local-databases';
import { readGroupList, saveGroupList } from './local-store';
import { nodeLocalDb } from './testing/node-local-db';

const USER = '00000000-0000-4000-8000-0000000000f1';
const G1 = '00000000-0000-4000-8000-000000000001';
const G2 = '00000000-0000-4000-8000-000000000002';

/** Database files on a fake device: in-memory SQLite per file name, gone once removed. */
function deviceFiles(): LocalDbFiles & { names(): string[] } {
  const files = new Map<string, Promise<LocalDb>>();
  return {
    open: (name) => {
      let db = files.get(name);
      if (!db) {
        db = nodeLocalDb();
        files.set(name, db);
      }
      return db;
    },
    remove: async (name) => {
      files.delete(name);
    },
    names: () => [...files.keys()],
  };
}

const listed = (id: string) => ({
  id,
  name: 'Pizza',
  emoji: '🍕',
  color: '#1E88E5',
  baseCurrency: 'PLN',
  startDate: null,
  endDate: null,
  simplifyDebts: true,
  archivedAt: null,
  ownerMemberId: '00000000-0000-4000-8000-0000000000a1',
  createdAt: '2026-07-01T10:00:00.000Z',
  lastActivityAt: '2026-07-01T10:00:00.000Z',
  lastEntry: null,
  lastEntryByOthersAt: null,
});

describe('local databases', () => {
  it('opens the device database without a signed-in user', async () => {
    const files = deviceFiles();
    const databases = createLocalDatabases(files);

    databases.openDevice();

    expect(await readGroupList(await databases.deviceDb())).toEqual([]);
    await expect(databases.userDb()).rejects.toThrow();
  });

  it("keeps the device database and the user's cache in separate files", async () => {
    const files = deviceFiles();
    const databases = createLocalDatabases(files);
    databases.openDevice();
    databases.selectUser(USER);

    await saveGroupList(await databases.userDb(), [listed(G1)]);

    expect(await readGroupList(await databases.deviceDb())).toEqual([]);
    expect(files.names()).toHaveLength(2);
  });

  it("the device database survives forgetting a user's cache (account deletion)", async () => {
    const files = deviceFiles();
    const databases = createLocalDatabases(files);
    databases.openDevice();
    databases.selectUser(USER);
    await saveGroupList(await databases.deviceDb(), [listed(G2)]);
    await saveGroupList(await databases.userDb(), [listed(G1)]);

    await databases.forgetUser(USER);

    await expect(databases.userDb()).rejects.toThrow();
    expect((await readGroupList(await databases.deviceDb())).map((g) => g.id)).toEqual([G2]);
    // On disk too: reopening the device file still finds the group, the user's file is gone.
    expect((await readGroupList(await files.open(databases.deviceFileName))).map((g) => g.id)).toEqual([G2]);
    databases.selectUser(USER);
    expect(await readGroupList(await databases.userDb())).toEqual([]);
  });

  it('opening the device database is idempotent', async () => {
    const files = deviceFiles();
    const databases = createLocalDatabases(files);
    databases.openDevice();
    await saveGroupList(await databases.deviceDb(), [listed(G2)]);

    databases.openDevice();

    expect((await readGroupList(await databases.deviceDb())).map((g) => g.id)).toEqual([G2]);
  });

  it('retries a failed open of the device database on the next call', async () => {
    let failing = true;
    const files = deviceFiles();
    const databases = createLocalDatabases({
      open: (name) => (failing ? Promise.reject(new Error('disk full')) : files.open(name)),
      remove: files.remove,
    });

    databases.openDevice();
    await expect(databases.deviceDb()).rejects.toThrow('disk full');
    failing = false;
    databases.openDevice();

    expect(await readGroupList(await databases.deviceDb())).toEqual([]);
  });

  it('signed out, no user is selected but their cache stays on the device', async () => {
    const files = deviceFiles();
    const databases = createLocalDatabases(files);
    databases.selectUser(USER);
    await saveGroupList(await databases.userDb(), [listed(G1)]);
    expect(databases.hasUser()).toBe(true);

    databases.deselectUser();

    expect(databases.hasUser()).toBe(false);
    await expect(databases.userDb()).rejects.toThrow();
    databases.selectUser(USER);
    expect((await readGroupList(await databases.userDb())).map((g) => g.id)).toEqual([G1]);
  });
});
