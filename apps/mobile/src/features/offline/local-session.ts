import { Platform } from 'react-native';
import type { LocalDb } from './local-db';
import { createLocalDatabases } from './local-databases';
import { deleteLocalDbFile, openLocalDb } from './open-local-db';

const databases = createLocalDatabases({ open: openLocalDb, remove: deleteLocalDbFile });

/**
 * Opens the device database (local groups, ADR-0021) — at app start, whether
 * or not anyone is signed in. Native only: on web it fails, like the cache.
 */
export function openDeviceDb(): void {
  databases.openDevice();
}

/**
 * Points the offline cache at the signed-in user's own database file, so one
 * account never reads another's cache or sends another's outbox. Idempotent;
 * the signed-in layout calls it on every render, before any screen queries.
 */
export function selectUserCache(userId: string): void {
  databases.selectUser(userId);
}

/** Signed out: stops using the user's cache (Profile's sign-out then deletes it, `forgetUserCache`). Idempotent. */
export function deselectUserCache(): void {
  databases.deselectUser();
}

/** Whether someone is signed in on this device (their cache is selected); signed out, only local groups exist. */
export function hasCacheUser(): boolean {
  return databases.hasUser();
}

/** The signed-in user's database: their offline cache and outbox. */
export function cacheDb(): Promise<LocalDb> {
  return databases.userDb();
}

/** The signed-in user's id (author of entries added on this device). */
export function cacheUserId(): string {
  return databases.userId();
}

/**
 * Deletes the user's database file (cache + outbox) — on sign-out (the
 * account's cache is cleared, SPEC "Local groups") and after the account was
 * deleted (#28). The device database (local groups) stays. Call after signing
 * out, so the signed-in layout doesn't select it again.
 */
export function forgetUserCache(userId: string): Promise<void> {
  return databases.forgetUser(userId);
}

/** The device database (local groups, kept across sign-out and account deletion) where there is one: native. The web has no local groups. */
export function deviceDbIfAny(): Promise<LocalDb | null> {
  return Platform.OS === 'web' ? Promise.resolve(null) : databases.deviceDb();
}
