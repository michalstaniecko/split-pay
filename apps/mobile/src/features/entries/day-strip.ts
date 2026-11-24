import { type LocalDate, type TripDates, tripDays } from '@split-pay/shared';
import type { ClaimLike } from '../claims/claims';
import type { ConversationItem } from './conversation';

/**
 * One day in the day strip. `index`: its separator's index in the
 * Conversation (FlashList `scrollToIndex`); `null` for a day without
 * entries — shown greyed out, nothing to jump to.
 */
export interface StripDay {
  date: LocalDate;
  index: number | null;
}

/**
 * The day strip's days, oldest first (#38): a group with dates shows every
 * day of its range, a group without dates only the days with entries.
 * Days with entries outside the range (entry dates are not limited to it)
 * are listed too, so every separator stays reachable.
 */
export function dayStripDays(items: readonly ConversationItem<ClaimLike>[], trip: TripDates): StripDay[] {
  const separators = new Map<LocalDate, number>();
  for (const [index, item] of items.entries()) {
    if (item.type === 'day') separators.set(item.date, index);
  }
  const days = new Set([...tripDays(trip), ...separators.keys()]);
  return [...days].sort().map((date) => ({ date, index: separators.get(date) ?? null }));
}
