import { suggestCategory } from './category';
import type { Category, Group, Id, LocalDate, Member, NewEntry } from './model';
import type { CurrencyCode, MinorAmount } from './money';
import { defaultParticipants } from './split';

/**
 * Default date of a new entry (composer and full form): today; in a trip,
 * when today is outside the trip's dates, the nearest day of the range.
 * `today` is the device's local calendar date.
 */
export function defaultEntryDate(today: LocalDate, group: Pick<Group, 'startDate' | 'endDate'>): LocalDate {
  if (group.startDate === null || group.endDate === null) return today;
  if (today < group.startDate) return group.startDate;
  if (today > group.endDate) return group.endDate;
  return today;
}

export type NewExpense = Extract<NewEntry, { kind: 'expense' }>;

/**
 * An equal-split expense the way the composer and the quick bill create it:
 * one payer paying the whole amount, the base currency (rate 1), split equally
 * among the members present on `date`. Participants are resolved now and
 * stored as member ids, so later attendance changes don't touch the entry
 * (ADR-0016). If nobody is present that day, everyone takes part — an entry
 * needs at least one participant. The category is suggested from the title
 * unless given.
 */
export function equalExpenseDefaults(input: {
  id: Id;
  title: string;
  amount: MinorAmount;
  /** The group's base currency. */
  currency: CurrencyCode;
  date: LocalDate;
  payerMemberId: Id;
  members: readonly Member[];
  category?: Category;
}): NewExpense {
  const present = defaultParticipants(input.members, input.date);
  const title = input.title.trim();
  return {
    kind: 'expense',
    id: input.id,
    date: input.date,
    title,
    amount: input.amount,
    currency: input.currency,
    rateToBase: '1',
    category: input.category ?? suggestCategory(title),
    receiptPhotoId: null,
    payers: [{ memberId: input.payerMemberId, amount: input.amount }],
    split: { mode: 'equal', memberIds: present.length > 0 ? present : input.members.map((m) => m.id) },
  };
}
