import {
  convert,
  type CurrencyCode,
  dailyTotals,
  type Entry,
  isEdited,
  type LocalDate,
  type Member,
  type MemberAmount,
  memberShare,
} from '@split-pay/shared';
import { activeClaims, type ClaimLike } from '../claims/claims';
import { todayLocalDate } from './expense-draft';

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
  /** The largest payer's member id (avatar). */
  payerId: string;
  /** All payers' names, largest amount first (screen-reader label). */
  payerNames: string[];
  /** How many other payers ("Kasia + 2"). */
  otherPayers: number;
  /** My share in the base currency ("twój udział"); `null` without a member of mine. */
  myShare: number | null;
  /** The content was edited after it was added ("edytowano", #11). */
  edited: boolean;
  /** A foreign-currency entry's amount in the base currency at its frozen rate ("≈ …"); `null` in the base currency. */
  baseAmount: number | null;
}

/** A claim system message ("Przejęcie profilu Tomek: Tomek", #18). */
export interface ClaimItem<C extends ClaimLike = ClaimLike> {
  type: 'claim';
  key: string;
  claim: C;
}

export type ConversationItem<C extends ClaimLike = ClaimLike> = DayItem | EntryItem | ClaimItem<C>;

/** Who "sent" an entry, largest amount first (ties by member id — deterministic). */
function holders(entry: Entry): MemberAmount[] {
  if (entry.kind === 'settlement') return [{ memberId: entry.from, amount: entry.amount }];
  const list = entry.kind === 'expense' ? entry.payers : entry.recipients;
  return [...list].sort((a, b) => b.amount - a.amount || (a.memberId < b.memberId ? -1 : 1));
}

/** A row before day separators: its day, the time it happened, a tie-breaker. */
type Message<C> = { date: LocalDate; at: string; id: string } & ({ entry: Entry } | { claim: C });

const byConversationOrder = (a: Message<unknown>, b: Message<unknown>) =>
  a.date.localeCompare(b.date) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id);

/**
 * The Conversation as list rows: entries ordered by entry date, then creation
 * time (ADR-0017), each day opened by a separator with the day's total.
 * Active claims are system messages on the (device-local) day they happened,
 * placed by claim time. `stickyHeaderIndices` are the separators' indices
 * (FlashList prop). Deleted entries and undone claims are not shown.
 */
export function conversationItems<C extends ClaimLike = ClaimLike>(
  entries: readonly Entry[],
  context: {
    members: readonly Pick<Member, 'id' | 'displayName'>[];
    myMemberId: string | null;
    baseCurrency: CurrencyCode;
    claims?: readonly C[];
    /** A timestamp's calendar day; defaults to the device's local date. */
    localDate?: (iso: string) => LocalDate;
  },
): { items: ConversationItem<C>[]; stickyHeaderIndices: number[] } {
  const live = entries.filter((e) => e.deletedAt === null);
  const localDate = context.localDate ?? ((iso: string) => todayLocalDate(new Date(iso)));
  const messages: Message<C>[] = [
    ...live.map((entry) => ({ date: entry.date, at: entry.createdAt, id: entry.id, entry })),
    ...activeClaims(context.claims ?? []).map((claim) => ({
      date: localDate(claim.claimedAt),
      at: claim.claimedAt,
      id: claim.id,
      claim,
    })),
  ].sort(byConversationOrder);
  const totals = dailyTotals(live, context.baseCurrency);
  const names = new Map(context.members.map((m) => [m.id, m.displayName]));
  const items: ConversationItem<C>[] = [];
  const stickyHeaderIndices: number[] = [];

  let day: LocalDate | null = null;
  for (const message of messages) {
    if (message.date !== day) {
      day = message.date;
      stickyHeaderIndices.push(items.length);
      items.push({ type: 'day', key: `day-${day}`, date: day, total: totals.get(day) ?? 0 });
    }
    if ('claim' in message) {
      items.push({ type: 'claim', key: `claim-${message.claim.id}`, claim: message.claim });
      continue;
    }
    const { entry } = message;
    const senders = holders(entry);
    const me = context.myMemberId;
    items.push({
      type: 'entry',
      key: entry.id,
      entry,
      side: me !== null && senders.some((h) => h.memberId === me) ? 'end' : 'start',
      payerName: names.get(senders[0]!.memberId) ?? '?',
      payerId: senders[0]!.memberId,
      payerNames: senders.map((h) => names.get(h.memberId) ?? '?'),
      otherPayers: senders.length - 1,
      myShare: me === null ? null : memberShare(entry, me, context.baseCurrency),
      edited: isEdited(entry),
      baseAmount:
        entry.currency === context.baseCurrency
          ? null
          : convert(entry.amount, entry.rateToBase, entry.currency, context.baseCurrency),
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
  items: readonly ConversationItem<ClaimLike>[],
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
