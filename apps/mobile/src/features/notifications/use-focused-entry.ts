import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { entryItemIndex } from './notifications';

/** How long the bubble a notification pointed at stays highlighted. */
const HIGHLIGHT_MS = 2500;

/**
 * Opening the Conversation from a notification (`?entryId=`): scrolls to that
 * entry's bubble and highlights it — once it is in the list (the sync may
 * still be loading it). Then drops the param so it doesn't happen again.
 * Returns the highlighted entry id.
 */
export function useFocusedEntry(
  items: readonly ({ type: 'entry'; entry: { id: string } } | { type: string })[],
  listRef: { current: { scrollToIndex(params: { index: number; animated?: boolean; viewPosition?: number }): unknown } | null },
  entryId: string | undefined,
): string | null {
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!entryId) return;
    const index = entryItemIndex(items, entryId);
    if (index === null) return;
    // After the list has laid out. Not cancelled: dropping the param below re-runs this effect.
    setTimeout(() => {
      void listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }, 100);
    setHighlightId(entryId);
    router.setParams({ entryId: undefined });
  }, [items, listRef, entryId]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return highlightId;
}
