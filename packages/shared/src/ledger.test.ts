import { describe, expect, it } from 'vitest';
import { computeBalances, dailyStats, pairwiseTransfers, simplifiedTransfers, type Transfer } from './ledger';
import type { Entry } from './model';
import { ANIA, BARTEK, KASIA, TOMEK, expense, income, settlement, sum } from './test-fixtures';

/** Scenariusz wyjazdu: codziennie ktoś inny robi zakupy, Tomek dojeżdża 12.07. */
const trip: Entry[] = [
  expense({
    date: '2026-07-10',
    amount: 30_000,
    payers: [{ memberId: ANIA, amount: 30_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
  }),
  expense({
    date: '2026-07-11',
    amount: 12_000,
    payers: [{ memberId: BARTEK, amount: 12_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
  }),
  expense({
    date: '2026-07-12',
    amount: 20_000,
    payers: [
      { memberId: KASIA, amount: 15_000 },
      { memberId: TOMEK, amount: 5_000 },
    ],
    split: {
      mode: 'commonPlusPersonal',
      commonMemberIds: [ANIA, BARTEK, KASIA, TOMEK],
      personal: [{ memberId: TOMEK, amount: 4_000 }],
    },
  }),
  expense({
    date: '2026-07-13',
    title: 'Kolacja w Czechach',
    amount: 2_000,
    currency: 'EUR',
    rateToBase: '4.25',
    payers: [{ memberId: TOMEK, amount: 2_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA, TOMEK] },
  }),
  income({
    amount: 40_000,
    recipients: [{ memberId: ANIA, amount: 40_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA, TOMEK] },
  }),
];

const applyTransfers = (balances: Map<string, number>, transfers: Transfer[]) => {
  const result = new Map(balances);
  for (const t of transfers) {
    result.set(t.from, (result.get(t.from) ?? 0) + t.amount);
    result.set(t.to, (result.get(t.to) ?? 0) - t.amount);
  }
  return result;
};

describe('computeBalances', () => {
  it('liczy salda wyjazdu w walucie bazowej i sumuje się do zera', () => {
    const balances = computeBalances(trip, 'PLN');
    expect(sum(balances.values())).toBe(0);
    expect(Object.fromEntries(balances)).toEqual({
      // Ania: zapłaciła 300, konsumpcja 100+40+40+21,25, otrzymała kaucję 400 za wszystkich (−400 + 100)
      [ANIA]: 30_000 - 10_000 - 4_000 - 4_000 - 2_125 - 40_000 + 10_000,
      [BARTEK]: 12_000 - 10_000 - 4_000 - 4_000 - 2_125 + 10_000,
      [KASIA]: 15_000 - 10_000 - 4_000 - 4_000 - 2_125 + 10_000,
      [TOMEK]: 5_000 + 8_500 - 8_000 - 2_125 + 10_000,
    });
  });

  it('pomija usunięte wpisy', () => {
    const [first] = trip;
    expect(computeBalances([{ ...first!, deletedAt: '2026-07-11T00:00:00Z' }], 'PLN').size).toBe(0);
  });

  it('spłata wyrównuje saldo', () => {
    const balances = computeBalances(
      [
        expense({ amount: 10_000, payers: [{ memberId: ANIA, amount: 10_000 }], split: { mode: 'equal', memberIds: [ANIA, BARTEK] } }),
        settlement({ amount: 5_000, from: BARTEK, to: ANIA }),
      ],
      'PLN',
    );
    expect(Object.fromEntries(balances)).toEqual({ [ANIA]: 0, [BARTEK]: 0 });
  });
});

describe('dailyStats', () => {
  it('pokazuje kto ile wydał i skonsumował każdego dnia', () => {
    const stats = dailyStats(trip, 'PLN');
    expect([...stats.keys()]).toEqual(['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14']);
    expect(stats.get('2026-07-10')!.get(ANIA)).toEqual({ paid: 30_000, consumed: 10_000 });
    expect(stats.get('2026-07-12')!.get(TOMEK)).toEqual({ paid: 5_000, consumed: 8_000 });
    expect(stats.get('2026-07-13')!.get(TOMEK)).toEqual({ paid: 8_500, consumed: 2_125 });
  });

  it('suma (wydał − skonsumował) po dniach równa się saldu bez spłat', () => {
    const stats = dailyStats(trip, 'PLN');
    const balances = computeBalances(trip, 'PLN');
    for (const [memberId, balance] of balances) {
      const net = sum([...stats.values()].map((day) => (day.get(memberId)?.paid ?? 0) - (day.get(memberId)?.consumed ?? 0)));
      expect(net).toBe(balance);
    }
  });
});

describe('transfers', () => {
  const balances = computeBalances(trip, 'PLN');

  it('uproszczone rozliczenie zeruje wszystkie salda', () => {
    const transfers = simplifiedTransfers(balances);
    expect([...applyTransfers(balances, transfers).values()].every((v) => v === 0)).toBe(true);
    expect(transfers.length).toBeLessThanOrEqual(balances.size - 1);
    expect(transfers.every((t) => t.amount > 0 && t.from !== t.to)).toBe(true);
  });

  it('rozliczenie bez upraszczania też zeruje wszystkie salda', () => {
    const transfers = pairwiseTransfers(trip, 'PLN');
    expect([...applyTransfers(balances, transfers).values()].every((v) => v === 0)).toBe(true);
  });

  it('uproszczenie skraca łańcuch A→B→C do A→C', () => {
    const chain: Entry[] = [
      expense({ amount: 1000, payers: [{ memberId: BARTEK, amount: 1000 }], split: { mode: 'equal', memberIds: [ANIA] } }),
      expense({ amount: 1000, payers: [{ memberId: KASIA, amount: 1000 }], split: { mode: 'equal', memberIds: [BARTEK] } }),
    ];
    expect(pairwiseTransfers(chain, 'PLN')).toEqual([
      { from: ANIA, to: BARTEK, amount: 1000 },
      { from: BARTEK, to: KASIA, amount: 1000 },
    ]);
    expect(simplifiedTransfers(computeBalances(chain, 'PLN'))).toEqual([{ from: ANIA, to: KASIA, amount: 1000 }]);
  });

  it('jest deterministyczne niezależnie od kolejności wpisów', () => {
    const reversed = [...trip].reverse();
    expect(simplifiedTransfers(computeBalances(reversed, 'PLN'))).toEqual(simplifiedTransfers(balances));
    expect(pairwiseTransfers(reversed, 'PLN')).toEqual(pairwiseTransfers(trip, 'PLN'));
  });
});
