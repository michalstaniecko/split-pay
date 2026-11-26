import type { Entry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { groupPreview } from './group-preview';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const GROUP = id(100);
const ANIA = id(1);
const BARTEK = id(2);
const KASIA = id(3);
const members = [
  { id: ANIA, displayName: 'Ania' },
  { id: BARTEK, displayName: 'Bartek' },
  { id: KASIA, displayName: 'Kasia' },
];

let seq = 1000;
const base = (date: string, createdAt: string) => ({
  id: id(seq++),
  groupId: GROUP,
  version: 1,
  createdBy: '',
  createdByMember: null,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
  date,
});

const expense = (
  date: string,
  createdAt: string,
  payers: { memberId: string; amount: number }[],
  money: { amount?: number; currency?: string; rateToBase?: string } = {},
): Entry => ({
  kind: 'expense',
  ...base(date, createdAt),
  amount: money.amount ?? 900,
  currency: money.currency ?? 'PLN',
  rateToBase: money.rateToBase ?? '1',
  title: 'Pizza',
  category: 'food',
  receiptPhotoId: null,
  payers,
  split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
});

const income = (date: string, createdAt: string, recipients: { memberId: string; amount: number }[]): Entry => ({
  kind: 'income',
  ...base(date, createdAt),
  amount: 300,
  currency: 'PLN',
  rateToBase: '1',
  title: 'Zwrot kaucji',
  category: 'other',
  receiptPhotoId: null,
  recipients,
  split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
});

const settlement = (date: string, createdAt: string, from: string, to: string): Entry => ({
  kind: 'settlement',
  ...base(date, createdAt),
  amount: 500,
  currency: 'PLN',
  rateToBase: '1',
  from,
  to,
});

const context = { members, myMemberId: null, baseCurrency: 'PLN' };

describe('groupPreview', () => {
  it('orders entries by entry date ascending under day headers carrying each day’s total, with the group total', () => {
    const late = expense('2026-07-11', '2026-07-11T20:00:00.000Z', [{ memberId: BARTEK, amount: 900 }]);
    const early = expense('2026-07-11', '2026-07-11T08:00:00.000Z', [{ memberId: ANIA, amount: 900 }]);
    const backdated = expense('2026-07-10', '2026-07-12T09:00:00.000Z', [{ memberId: KASIA, amount: 900 }]);
    const deleted = { ...expense('2026-07-10', '2026-07-10T09:00:00.000Z', [{ memberId: KASIA, amount: 900 }]), deletedAt: '2026-07-10T10:00:00.000Z' };

    const preview = groupPreview([late, early, backdated, deleted], context);

    expect(preview.days.map((d) => [d.date, d.total, d.rows.map((r) => r.entry.id)])).toEqual([
      ['2026-07-10', 900, [backdated.id]],
      ['2026-07-11', 1800, [early.id, late.id]],
    ]);
    expect(preview.total).toBe(2700);
  });

  it('names an expense’s payers largest amount first, in the base currency without an original amount', () => {
    const shared = expense('2026-07-10', '2026-07-10T09:00:00.000Z', [
      { memberId: KASIA, amount: 300 },
      { memberId: ANIA, amount: 600 },
    ]);
    const [row] = groupPreview([shared], context).days[0]!.rows;
    expect(row).toMatchObject({ entry: { kind: 'expense' }, names: ['Ania', 'Kasia'], amount: 900, original: null });
  });

  it('shows a foreign-currency entry in the base currency at its frozen rate, with the original amount', () => {
    const dinner = expense('2026-07-10', '2026-07-10T09:00:00.000Z', [{ memberId: ANIA, amount: 2000 }], {
      amount: 2000,
      currency: 'EUR',
      rateToBase: '4.3215',
    });
    const preview = groupPreview([dinner], context);
    expect(preview.days[0]!.rows[0]).toMatchObject({ amount: 8643, original: { amount: 2000, currency: 'EUR' } });
    expect(preview.total).toBe(8643);
  });

  it('lists an income’s recipients instead of a payer', () => {
    const refund = income('2026-07-10', '2026-07-10T09:00:00.000Z', [{ memberId: BARTEK, amount: 300 }]);
    expect(groupPreview([refund], context).days[0]!.rows[0]).toMatchObject({ entry: { kind: 'income' }, names: ['Bartek'], amount: 300 });
  });

  it('names a settlement’s sender and receiver; it is not spending, so the day total leaves it out', () => {
    const paid = settlement('2026-07-10', '2026-07-10T09:00:00.000Z', KASIA, ANIA);
    const preview = groupPreview([paid], context);
    expect(preview.days[0]).toMatchObject({ total: 0, rows: [{ entry: { kind: 'settlement' }, names: ['Kasia', 'Ania'], amount: 500 }] });
    expect(preview.total).toBe(0);
  });

  it('gives no share without "this is me", and with it the member’s share of each entry (0 when they have none)', () => {
    const pizza = expense('2026-07-10', '2026-07-10T09:00:00.000Z', [{ memberId: ANIA, amount: 900 }]);
    const refund = income('2026-07-10', '2026-07-10T10:00:00.000Z', [{ memberId: ANIA, amount: 300 }]);
    const paid = settlement('2026-07-10', '2026-07-10T11:00:00.000Z', KASIA, ANIA);
    const entries = [pizza, refund, paid];

    expect(groupPreview(entries, context).days[0]!.rows.map((r) => r.myShare)).toEqual([null, null, null]);
    // An income share is negative: it lowers what the member consumed.
    expect(groupPreview(entries, { ...context, myMemberId: KASIA }).days[0]!.rows.map((r) => r.myShare)).toEqual([300, -100, 0]);
  });
});
