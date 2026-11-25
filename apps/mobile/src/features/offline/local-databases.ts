import type { LocalDb } from './local-db';

/** Database files on the device: expo-sqlite in the app (`open-local-db.ts`), in-memory SQLite in tests. */
export interface LocalDbFiles {
  /** Opens (creating and migrating if needed) a database file. */
  open(name: string): Promise<LocalDb>;
  /** Closes (if open) and deletes a database file. */
  remove(name: string): Promise<void>;
}

const userFileName = (userId: string) => `split-pay-${userId}.db`;

/**
 * The device's two kinds of local database, same schema (`local-db.ts`):
 *
 * - the **per-user cache** (ADR-0005): the signed-in user's groups and
 *   outbox, one file per account, deleted with the account;
 * - the **device database** (ADR-0021): local groups, owned by the device,
 *   not by any user — opened at app start whether or not anyone is signed in,
 *   and never deleted by signing out or deleting an account.
 */
export function createLocalDatabases(files: LocalDbFiles, deviceFileName = 'split-pay-device.db') {
  let device: Promise<LocalDb> | null = null;
  let user: { userId: string; db: Promise<LocalDb> } | null = null;

  /** Opens a file; a failed open is retried on the next call instead of being kept. */
  const open = (name: string, isCurrent: (db: Promise<LocalDb>) => boolean, forget: () => void) => {
    const db = files.open(name);
    db.catch(() => {
      if (isCurrent(db)) forget();
    });
    return db;
  };

  const openDevice = (): Promise<LocalDb> => {
    device ??= open(
      deviceFileName,
      (db) => device === db,
      () => {
        device = null;
      },
    );
    return device;
  };

  return {
    deviceFileName,

    /** Opens the device database (app start, signed in or not). Idempotent. */
    openDevice(): void {
      void openDevice().catch(() => undefined);
    },

    /** The device database (local groups); opened on first use if app start didn't. */
    deviceDb: openDevice,

    /**
     * Points the per-user cache at the signed-in user's own file, so one
     * account never reads another's cache or sends another's outbox. Idempotent.
     */
    selectUser(userId: string): void {
      if (user?.userId === userId) return;
      const db = open(
        userFileName(userId),
        (d) => user?.db === d,
        () => {
          user = null;
        },
      );
      user = { userId, db };
    },

    /** Signed out: no user's cache is in use any more; their file stays (see `forgetUser`). */
    deselectUser(): void {
      user = null;
    },

    /** Whether a signed-in user's cache is selected. */
    hasUser(): boolean {
      return user !== null;
    },

    /** The signed-in user's cache. */
    userDb(): Promise<LocalDb> {
      if (!user) return Promise.reject(new Error('No signed-in user selected for the offline cache'));
      return user.db;
    },

    /** The signed-in user's id (author of entries added on this device). */
    userId(): string {
      if (!user) throw new Error('No signed-in user selected for the offline cache');
      return user.userId;
    },

    /** Deletes the user's cache file (cache + outbox). The device database stays. */
    async forgetUser(userId: string): Promise<void> {
      if (user?.userId === userId) {
        const { db } = user;
        user = null;
        // Let a pending open finish before closing its file.
        await db.catch(() => undefined);
      }
      await files.remove(userFileName(userId));
    },
  };
}

export type LocalDatabases = ReturnType<typeof createLocalDatabases>;
