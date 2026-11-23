import { describe, expect, it } from 'vitest';
import { computeBalances } from './ledger';
import type { Entry } from './model';
import { groupStats } from './stats';
import { ANIA, BARTEK, KASIA, TOMEK, expense, income, settlement, sum } from './test-fixtures';

/** A three-day trip: groceries, a dinner abroad, an accommodation refund and a settlement. */
const trip: Entry[] = [
  expense({
    date: '2026-07-10',
    category: 'groceries',
    amount: 30_000,
    payers: [{ memberId: ANIA, amount: 30_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
  }),
  expense({
    date: '2026-07-10',
    category: 'accommodation',
    amount: 60_000,
    payers: [{ memberId: BARTEK, amount: 60_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
  }),
  expense({
    date: '2026-07-12',
    category: 'food',
    amount: 2_000,
    currency: 'EUR',
    rateToBase: '4.25',
    payers: [{ memberId: TOMEK, amount: 2_000 }],
    split: { mode: 'equal', memberIds: [ANIA, TOMEK] },
  }),
  income({
    date: '2026-07-12',
    category: 'accommodation',
    amount: 9_000,
    recipients: [{ memberId: KASIA, amount: 9_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
  }),
  settlement({ date: '2026-07-12', amount: 5_000, from: ANIA, to: BARTEK }),
  expense({
    date: '2026-07-11',
    category: 'alcohol',
    amount: 99_999,
    payers: [{ memberId: ANIA, amount: 99_999 }],
    split: { mode: 'equal', memberIds: [ANIA] },
    deletedAt: '2026-07-11T12:00:00Z',
  }),
];

describe('groupStats', () => {
  const stats = groupStats(trip, 'PLN');

  it('lists the days with entries in date order, each with every involved member', () => {
    expect(stats.days.map((d) => d.date)).toEqual(['2026-07-10', '2026-07-12']);
    expect(stats.days[0]!.members).toEqual([
      { memberId: ANIA, paid: 30_000, consumed: 30_000 },
      { memberId: BARTEK, paid: 60_000, consumed: 30_000 },
      { memberId: KASIA, paid: 0, consumed: 30_000 },
    ]);
    expect(stats.days[0]!.total).toBe(90_000);
  });

  it('converts foreign currency to the base currency and lets incomes reduce paid and consumed', () => {
    // 20 EUR × 4.25 = 85 PLN; refund of 90 PLN received by Kasia, shared by three.
    expect(stats.days[1]!.members).toEqual([
      { memberId: ANIA, paid: 0, consumed: 4_250 - 3_000 },
      { memberId: BARTEK, paid: 0, consumed: -3_000 },
      { memberId: KASIA, paid: -9_000, consumed: -3_000 },
      { memberId: TOMEK, paid: 8_500, consumed: 4_250 },
    ]);
    expect(stats.days[1]!.total).toBe(8_500 - 9_000);
  });

  it('sums every member over the whole trip', () => {
    expect(stats.members).toEqual([
      { memberId: ANIA, paid: 30_000, consumed: 31_250 },
      { memberId: BARTEK, paid: 60_000, consumed: 27_000 },
      { memberId: KASIA, paid: -9_000, consumed: 27_000 },
      { memberId: TOMEK, paid: 8_500, consumed: 4_250 },
    ]);
    expect(stats.total).toBe(30_000 + 60_000 + 8_500 - 9_000);
  });

  it('breaks spending down by category, incomes reducing their category, largest first', () => {
    expect(stats.categories).toEqual([
      { category: 'accommodation', amount: 60_000 - 9_000 },
      { category: 'groceries', amount: 30_000 },
      { category: 'food', amount: 8_500 },
    ]);
    expect(sum(stats.categories.map((c) => c.amount))).toBe(stats.total);
  });

  it('per-member net over the trip equals the balance without settlements', () => {
    const balances = computeBalances(
      trip.filter((e) => e.kind !== 'settlement'),
      'PLN',
    );
    for (const m of stats.members) expect(m.paid - m.consumed).toBe(balances.get(m.memberId));
  });

  it('is empty for a group without entries', () => {
    expect(groupStats([], 'PLN')).toEqual({ baseCurrency: 'PLN', days: [], members: [], categories: [], total: 0 });
  });

  it('omits a category whose expenses and incomes cancel out', () => {
    const cancelled = groupStats(
      [
        expense({ category: 'fuel', amount: 1_000, payers: [{ memberId: ANIA, amount: 1_000 }], split: { mode: 'equal', memberIds: [ANIA] } }),
        income({ category: 'fuel', amount: 1_000, recipients: [{ memberId: ANIA, amount: 1_000 }], split: { mode: 'equal', memberIds: [ANIA] } }),
      ],
      'PLN',
    );
    expect(cancelled.categories).toEqual([]);
  });
});
