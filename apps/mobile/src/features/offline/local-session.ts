import { Platform } from 'react-native';
import type { LocalDb } from './local-db';
import { createLocalDatabases } from './local-databases';
import { deleteLocalDbFile, openLocalDb } from './open-local-db';

/**
 * The app's local databases (`local-databases.ts`) over the device's files:
 * the device database (local groups, opened at app start) and the signed-in
 * user's cache — selected by the signed-in layout on every render, deleted on
 * sign-out and after the account was deleted (#28).
 */
export const localDatabases = createLocalDatabases({ open: openLocalDb, remove: deleteLocalDbFile });

/** The device database (local groups, kept across sign-out and account deletion) where there is one: native. The web has no local groups. */
export function deviceDbIfAny(): Promise<LocalDb | null> {
  return Platform.OS === 'web' ? Promise.resolve(null) : localDatabases.deviceDb();
}
