import type { LocalDb } from './local-db';
import { openLocalDb } from './open-local-db';

let current: { userId: string; db: Promise<LocalDb> } | null = null;

/**
 * Points the offline cache at the signed-in user's own database file, so one
 * account never reads another's cache or sends another's outbox. Idempotent;
 * the signed-in layout calls it on every render, before any screen queries.
 */
export function selectLocalUser(userId: string): void {
  if (current?.userId === userId) return;
  const db = openLocalDb(`split-pay-${userId}.db`);
  // A failed open is retried on the next call instead of being cached.
  db.catch(() => {
    if (current?.db === db) current = null;
  });
  current = { userId, db };
}

/** The signed-in user's local database. */
export function localDb(): Promise<LocalDb> {
  if (!current) return Promise.reject(new Error('No signed-in user selected for the offline cache'));
  return current.db;
}

/** The signed-in user's id (author of entries added on this device). */
export function localUserId(): string {
  if (!current) throw new Error('No signed-in user selected for the offline cache');
  return current.userId;
}
