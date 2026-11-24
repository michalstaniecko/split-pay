import { useCallback, useSyncExternalStore } from 'react';
import { type ComposerDraft, emptyComposerDraft } from './expense-draft';

const drafts = new Map<string, ComposerDraft>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/**
 * The composer's draft per group, kept in memory outside React. The
 * Conversation's composer and the full expense form (a separate sheet route)
 * share it: "+" opens the form prefilled from it, saving clears it, and
 * dismissing the form leaves it untouched — so the values are back in the
 * composer (#8). Not persisted across app restarts.
 */
export const composerStore = {
  get: (groupId: string): ComposerDraft => drafts.get(groupId) ?? emptyComposerDraft,
  set: (groupId: string, draft: ComposerDraft) => {
    drafts.set(groupId, draft);
    notify();
  },
  clear: (groupId: string) => {
    drafts.delete(groupId);
    notify();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The group's composer draft and its setter. */
export function useComposerDraft(groupId: string) {
  const draft = useSyncExternalStore(
    composerStore.subscribe,
    () => composerStore.get(groupId),
    () => composerStore.get(groupId),
  );
  const setDraft = useCallback(
    (patch: Partial<ComposerDraft>) => composerStore.set(groupId, { ...composerStore.get(groupId), ...patch }),
    [groupId],
  );
  return [draft, setDraft] as const;
}
