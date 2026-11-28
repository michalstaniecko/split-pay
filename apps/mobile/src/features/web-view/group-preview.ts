import type { CurrencyCode, Entry, LocalDate } from '@split-pay/shared';
import { conversationItems } from '../entries/conversation';

/**
 * One row of the group preview's entries table. `names`: an expense's payers
 * or an income's recipients, largest amount first; a settlement's sender and
 * receiver (`[from, to]`). `amount` is in the base currency; `original` is
 * the entry's own amount when it is in a foreign currency. `myShare`: the
 * "this is me" member's share in the base currency ("Twój udział"; 0 when
 * they have none, negative for an income), `null` without "this is me".
 */
export interface PreviewRow {
  entry: Entry;
  names: string[];
  amount: number;
  original: { amount: number; currency: CurrencyCode } | null;
  myShare: number | null;
}

/** A day of the entries table. `total`: the group's net spending that day (expenses minus incomes). */
export interface PreviewDay {
  date: LocalDate;
  total: number;
  rows: PreviewRow[];
}

/**
 * The group preview's statement of entries (SPEC "Web interface"): live
 * entries by entry date ascending (then creation time, as in the
 * Conversation), one group per day with its total, and the group's net
 * spending over all days (`total`, the header). Settlements are not spending
 * and count towards no total.
 */
export function groupPreview(
  entries: readonly Entry[],
  context: {
    members: readonly { id: string; displayName: string }[];
    myMemberId: string | null;
    baseCurrency: CurrencyCode;
  },
): { total: number; days: PreviewDay[] } {
  const { items } = conversationItems(entries, context);
  const name = (memberId: string) => context.members.find((m) => m.id === memberId)?.displayName ?? '?';
  const days: PreviewDay[] = [];
  for (const item of items) {
    if (item.type === 'day') {
      days.push({ date: item.date, total: item.total, rows: [] });
      continue;
    }
    if (item.type !== 'entry') continue;
    const { entry } = item;
    days[days.length - 1]!.rows.push({
      entry,
      names: entry.kind === 'settlement' ? [name(entry.from), name(entry.to)] : item.payerNames,
      amount: item.baseAmount ?? entry.amount,
      original: item.baseAmount === null ? null : { amount: entry.amount, currency: entry.currency },
      myShare: item.myShare,
    });
  }
  return { total: days.reduce((sum, day) => sum + day.total, 0), days };
}
