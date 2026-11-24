import type { Entry } from '@split-pay/shared';
import { useMemo } from 'react';
import type { OutboxChange } from '@/features/offline/local-schema';
import { useOutboxState } from '@/features/offline/outbox-query';

/** A change the server rejected because the entry had changed meanwhile (409 `version_conflict`). */
export interface EntryConflict {
  entryId: string;
  change: OutboxChange;
  /** The server's current entry (may be deleted). */
  current: Entry;
}

/**
 * The group's conflicted entries (entry id → conflict), from the outbox state
 * persisted on the device (#22 replaced #11's in-memory store). The bubble
 * shows a red "!" until the conflict sheet resolves it.
 */
export function useEntryConflicts(groupId: string): ReadonlyMap<string, EntryConflict> {
  const outbox = useOutboxState(groupId);
  return useMemo(() => {
    const conflicts = new Map<string, EntryConflict>();
    for (const [entryId, state] of outbox) {
      if (state.status === 'conflict' && state.current) conflicts.set(entryId, { entryId, change: state.change, current: state.current });
    }
    return conflicts;
  }, [outbox]);
}
