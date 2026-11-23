import { dailyStats, entryEffect } from './ledger';
import { Category, type Entry, type Id, type LocalDate } from './model';
import type { CurrencyCode } from './money';

/** What a member paid and consumed, in the group's base currency (minor units). */
export interface MemberStats {
  memberId: Id;
  /** Paid out (expenses) minus income received. */
  paid: number;
  /** Sum of shares of expenses minus shares of incomes. */
  consumed: number;
}

export interface DayStats {
  date: LocalDate;
  /** Members involved that day, ordered by member id. */
  members: MemberStats[];
  /** The group's net spending that day (sum of `consumed`). */
  total: number;
}

export interface CategoryStats {
  category: Category;
  /** Expenses minus incomes of this category, in the base currency. */
  amount: number;
}

/**
 * The Stats screen (Group info → Stats) as plain JSON: the days × people
 * table, per-member totals and the breakdown by category. Settlements and
 * deleted entries are skipped; an income reduces its recipients' `paid`, its
 * participants' `consumed` and its category's amount (SPEC, "Daily stats").
 */
export interface GroupStats {
  baseCurrency: CurrencyCode;
  /** Days with entries, in date order. */
  days: DayStats[];
  /** Whole-trip totals per member, ordered by member id. */
  members: MemberStats[];
  /** Non-zero categories, largest amount first (ties in `Category` order). */
  categories: CategoryStats[];
  /** The group's net spending over the whole trip (= sum of the categories). */
  total: number;
}

const byMemberId = (a: MemberStats, b: MemberStats) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0);
const sumConsumed = (xs: readonly MemberStats[]) => xs.reduce((acc, m) => acc + m.consumed, 0);

export function groupStats(entries: readonly Entry[], baseCurrency: CurrencyCode): GroupStats {
  const totals = new Map<Id, MemberStats>();
  const days: DayStats[] = [];
  for (const [date, day] of dailyStats(entries, baseCurrency)) {
    const members = [...day].map(([memberId, s]) => ({ memberId, paid: s.paid, consumed: s.consumed })).sort(byMemberId);
    for (const m of members) {
      const t = totals.get(m.memberId) ?? { memberId: m.memberId, paid: 0, consumed: 0 };
      totals.set(m.memberId, { memberId: m.memberId, paid: t.paid + m.paid, consumed: t.consumed + m.consumed });
    }
    days.push({ date, members, total: sumConsumed(members) });
  }

  const byCategory = new Map<Category, number>();
  for (const entry of entries) {
    if (entry.deletedAt !== null || entry.kind === 'settlement') continue;
    const amount = entryEffect(entry, baseCurrency).consumed.reduce((acc, c) => acc + c.amount, 0);
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + amount);
  }
  const order = Category.options;
  const categories = [...byCategory]
    .filter(([, amount]) => amount !== 0)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || order.indexOf(a.category) - order.indexOf(b.category));

  const members = [...totals.values()].sort(byMemberId);
  return { baseCurrency, days, members, categories, total: sumConsumed(members) };
}
