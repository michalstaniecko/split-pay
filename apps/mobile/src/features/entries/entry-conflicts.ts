import type { Entry } from '@split-pay/shared';
import { useSyncExternalStore } from 'react';

/** A change the server rejected because the entry had changed meanwhile (409 `version_conflict`). */
export interface EntryConflict {
  entryId: string;
  change: 'edit' | 'delete' | 'restore';
  /** The server's current entry (may be deleted). */
  current: Entry;
}

const EMPTY: ReadonlyMap<string, EntryConflict> = new Map();
const byGroup = new Map<string, ReadonlyMap<string, EntryConflict>>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/**
 * Entries whose last change was rejected as a version conflict, per group, in
 * memory: the bubble shows a red "!" until the user opens the conflict sheet
 * and reloads the entry (#11). Each group's map is replaced on change, so it
 * is a stable `useSyncExternalStore` snapshot. #22 (offline) replaces this
 * with the outbox state and "keep my / their version" (#23).
 */
export const entryConflicts = {
  forGroup: (groupId: string): ReadonlyMap<string, EntryConflict> => byGroup.get(groupId) ?? EMPTY,
  get: (groupId: string, entryId: string): EntryConflict | undefined => byGroup.get(groupId)?.get(entryId),
  mark: (groupId: string, conflict: EntryConflict) => {
    byGroup.set(groupId, new Map(entryConflicts.forGroup(groupId)).set(conflict.entryId, conflict));
    notify();
  },
  resolve: (groupId: string, entryId: string) => {
    const next = new Map(entryConflicts.forGroup(groupId));
    if (!next.delete(entryId)) return;
    byGroup.set(groupId, next);
    notify();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The group's conflicted entries (entry id → conflict). */
export function useEntryConflicts(groupId: string): ReadonlyMap<string, EntryConflict> {
  return useSyncExternalStore(
    entryConflicts.subscribe,
    () => entryConflicts.forGroup(groupId),
    () => entryConflicts.forGroup(groupId),
  );
}
