import {
  type CurrencyCode,
  dailyTotals,
  type Entry,
  type LocalDate,
  type Member,
  type MemberAmount,
  memberShare,
} from '@split-pay/shared';

/** My member in a group: the one linked to my account (`null` when signed out or not found). */
export function myMemberId(members: readonly Pick<Member, 'id' | 'userId'>[], userId: string | undefined): string | null {
  if (!userId) return null;
  return members.find((m) => m.userId === userId)?.id ?? null;
}

/**
 * Sticky day separator. `total`: the group's net spending that day in the
 * base currency — expenses minus incomes (`dailyTotals`), so it can be negative.
 */
export interface DayItem {
  type: 'day';
  key: string;
  date: LocalDate;
  total: number;
}

/** One bubble. */
export interface EntryItem {
  type: 'entry';
  key: string;
  entry: Entry;
  /** `end` when I am among the payers (income: recipients; settlement: sender), else `start`. RTL mirrors it. */
  side: 'start' | 'end';
  /** The largest payer (recipient, settlement sender) — the bubble's author. */
  payerName: string;
  /** How many other payers ("Kasia + 2"). */
  otherPayers: number;
  /** My share in the base currency ("twój udział"); `null` without a member of mine. */
  myShare: number | null;
}

export type ConversationItem = DayItem | EntryItem;

/** Who "sent" an entry, largest amount first (ties by member id — deterministic). */
function holders(entry: Entry): MemberAmount[] {
  if (entry.kind === 'settlement') return [{ memberId: entry.from, amount: entry.amount }];
  const list = entry.kind === 'expense' ? entry.payers : entry.recipients;
  return [...list].sort((a, b) => b.amount - a.amount || (a.memberId < b.memberId ? -1 : 1));
}

const byConversationOrder = (a: Entry, b: Entry) =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * The Conversation as list rows: entries ordered by entry date, then creation
 * time (ADR-0017), each day opened by a separator with the day's total.
 * `stickyHeaderIndices` are the separators' indices (FlashList prop).
 * Deleted entries are not shown.
 */
export function conversationItems(
  entries: readonly Entry[],
  context: { members: readonly Member[]; myMemberId: string | null; baseCurrency: CurrencyCode },
): { items: ConversationItem[]; stickyHeaderIndices: number[] } {
  const live = entries.filter((e) => e.deletedAt === null).sort(byConversationOrder);
  const totals = dailyTotals(live, context.baseCurrency);
  const names = new Map(context.members.map((m) => [m.id, m.displayName]));
  const items: ConversationItem[] = [];
  const stickyHeaderIndices: number[] = [];

  let day: LocalDate | null = null;
  for (const entry of live) {
    if (entry.date !== day) {
      day = entry.date;
      stickyHeaderIndices.push(items.length);
      items.push({ type: 'day', key: `day-${entry.date}`, date: entry.date, total: totals.get(entry.date) ?? 0 });
    }
    const senders = holders(entry);
    const me = context.myMemberId;
    items.push({
      type: 'entry',
      key: entry.id,
      entry,
      side: me !== null && senders.some((h) => h.memberId === me) ? 'end' : 'start',
      payerName: names.get(senders[0]!.memberId) ?? '?',
      otherPayers: senders.length - 1,
      myShare: me === null ? null : memberShare(entry, me, context.baseCurrency),
    });
  }
  return { items, stickyHeaderIndices };
}

/**
 * The entry to scroll to and highlight after the list changed: of the entries
 * not in `previousIds`, the most recently created (e.g. a backdated expense
 * just added). `null` on the first load (`previousIds === null`) or when
 * nothing was added.
 */
export function newestAddedEntry(
  previousIds: ReadonlySet<string> | null,
  items: readonly ConversationItem[],
): { id: string; index: number } | null {
  if (previousIds === null) return null;
  let newest: EntryItem | null = null;
  let newestIndex = -1;
  for (const [index, item] of items.entries()) {
    if (item.type !== 'entry' || previousIds.has(item.entry.id)) continue;
    if (!newest || item.entry.createdAt > newest.entry.createdAt) {
      newest = item;
      newestIndex = index;
    }
  }
  return newest ? { id: newest.entry.id, index: newestIndex } : null;
}
