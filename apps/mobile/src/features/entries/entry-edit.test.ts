import { type Expense, type Income, type Member, toNewEntry } from '@split-pay/shared';
import { DetailedError } from 'hono/client';
import { describe, expect, it } from 'vitest';
import {
  amountForClipboard,
  editedEntry,
  entryActions,
  expenseFormFromEntry,
  type FormEntry,
  versionConflictEntry,
} from './entry-edit';
import { withDate } from './expense-draft';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const GROUP = id(100);
const ANIA = id(1);
const BARTEK = id(2);
const KASIA = id(3);
const TOMEK = id(4);
const member = (memberId: string, displayName: string, attendance: Member['attendance'] = null): Member => ({
  id: memberId,
  groupId: GROUP,
  displayName,
  userId: null,
  attendance,
});
// Tomek arrives on the 12th.
const members = [
  member(ANIA, 'Ania'),
  member(BARTEK, 'Bartek'),
  member(KASIA, 'Kasia'),
  member(TOMEK, 'Tomek', [{ from: '2026-07-12', to: '2026-07-14' }]),
];
const group = { id: GROUP, baseCurrency: 'PLN', startDate: '2026-07-10', endDate: '2026-07-14' };

const pizza: Expense = {
  kind: 'expense',
  id: id(500),
  groupId: GROUP,
  version: 2,
  createdBy: id(200),
  createdAt: '2026-07-11T18:00:00.000Z',
  updatedAt: '2026-07-11T19:00:00.000Z',
  deletedAt: null,
  date: '2026-07-11',
  amount: 12_345,
  currency: 'PLN',
  rateToBase: '1',
  title: 'Pizza',
  category: 'food',
  receiptPhotoId: id(900),
  payers: [{ memberId: BARTEK, amount: 12_345 }],
  // Hand-picked: Kasia skipped dinner.
  split: { mode: 'equal', memberIds: [ANIA, BARTEK] },
};

const { payers: _payers, ...pizzaFields } = pizza;
const refund: Income = {
  ...pizzaFields,
  kind: 'income',
  id: id(501),
  title: 'Kaucja',
  category: 'accommodation',
  amount: 30_000,
  recipients: [{ memberId: KASIA, amount: 30_000 }],
  split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
};

describe('expenseFormFromEntry', () => {
  it('opens the form with the entry as entered', () => {
    expect(expenseFormFromEntry(pizza)).toEqual({
      amount: '123.45',
      title: 'Pizza',
      payerMemberId: BARTEK,
      date: '2026-07-11',
      category: 'food',
      categoryChosen: true,
      currency: 'PLN',
      rate: '1',
      rateEdited: true,
      participantIds: [ANIA, BARTEK],
      participantsDate: '2026-07-11',
      split: { mode: 'equal', exact: {}, weights: {}, personal: {} },
      payers: { multiple: false, amounts: {} },
      kind: 'expense',
    });
  });

  it('writes whole amounts without decimals', () => {
    expect(expenseFormFromEntry({ ...pizza, amount: 10_000, payers: [{ memberId: BARTEK, amount: 10_000 }] }).amount).toBe('100');
    expect(expenseFormFromEntry({ ...pizza, amount: 5, payers: [{ memberId: BARTEK, amount: 5 }] }).amount).toBe('0.05');
  });

  it('opens several payers as the multiple-payers option, the largest as the payer', () => {
    const shared = { ...pizza, amount: 10_000, payers: [{ memberId: ANIA, amount: 3_000 }, { memberId: BARTEK, amount: 7_000 }] };
    expect(expenseFormFromEntry(shared)).toMatchObject({
      payerMemberId: BARTEK,
      payers: { multiple: true, amounts: { [ANIA]: '30', [BARTEK]: '70' } },
    });
  });

  it('opens every split mode with its values', () => {
    const exact = expenseFormFromEntry({ ...pizza, split: { mode: 'exact', amounts: [{ memberId: ANIA, amount: 2_345 }, { memberId: BARTEK, amount: 10_000 }] } });
    expect(exact.split).toMatchObject({ mode: 'exact', exact: { [ANIA]: '23.45', [BARTEK]: '100' } });

    const shares = expenseFormFromEntry({ ...pizza, split: { mode: 'shares', weights: [{ memberId: ANIA, weight: 2 }, { memberId: KASIA, weight: 1 }] } });
    expect(shares.split).toMatchObject({ mode: 'shares', weights: { [ANIA]: '2', [KASIA]: '1' } });

    const personal = expenseFormFromEntry({
      ...pizza,
      split: { mode: 'commonPlusPersonal', commonMemberIds: [ANIA, KASIA], personal: [{ memberId: BARTEK, amount: 2_000 }] },
    });
    expect(personal).toMatchObject({ participantIds: [ANIA, KASIA], split: { mode: 'commonPlusPersonal', personal: { [BARTEK]: '20' } } });
  });

  it('keeps the frozen rate of a foreign-currency entry (no ECB prefill over it)', () => {
    const euro = { ...pizza, currency: 'EUR', rateToBase: '4.2817', amount: 2_050, payers: [{ memberId: BARTEK, amount: 2_050 }] };
    expect(expenseFormFromEntry(euro)).toMatchObject({ amount: '20.5', currency: 'EUR', rate: '4.2817', rateEdited: true });
    const r = editedEntry(euro, expenseFormFromEntry(euro), { group, members });
    expect(r).toEqual({ ok: true, value: toNewEntry(euro) });
  });

  it('opens an income with its recipient as the person', () => {
    expect(expenseFormFromEntry(refund)).toMatchObject({ kind: 'income', payerMemberId: KASIA });
  });
});

describe('editedEntry', () => {
  const context = { group, members };

  it('saves the changed fields and keeps the id and the receipt', () => {
    const r = editedEntry(pizza, { ...expenseFormFromEntry(pizza), title: 'Pizza i napoje', amount: '150' }, context);
    expect(r).toEqual({
      ok: true,
      value: {
        kind: 'expense',
        id: pizza.id,
        date: '2026-07-11',
        title: 'Pizza i napoje',
        amount: 15_000,
        currency: 'PLN',
        rateToBase: '1',
        category: 'food',
        receiptPhotoId: id(900),
        payers: [{ memberId: BARTEK, amount: 15_000 }],
        split: { mode: 'equal', memberIds: [ANIA, BARTEK] },
      },
    });
  });

  it('an untouched form saves the same entry (every split mode, several payers)', () => {
    const entries: FormEntry[] = [
      pizza,
      { ...pizza, amount: 10_000, payers: [{ memberId: ANIA, amount: 3_000 }, { memberId: BARTEK, amount: 7_000 }], split: { mode: 'exact', amounts: [{ memberId: ANIA, amount: 4_000 }, { memberId: BARTEK, amount: 6_000 }] } },
      { ...pizza, split: { mode: 'shares', weights: [{ memberId: ANIA, weight: 2 }, { memberId: KASIA, weight: 1 }] } },
      { ...pizza, split: { mode: 'commonPlusPersonal', commonMemberIds: [ANIA, KASIA], personal: [{ memberId: BARTEK, amount: 2_000 }] } },
      refund,
    ];
    for (const entry of entries) {
      const r = editedEntry(entry, expenseFormFromEntry(entry), context);
      expect(r).toEqual({ ok: true, value: toNewEntry(entry) });
    }
  });

  it('moves default participants along with a new date, hand-picked ones stay', () => {
    const defaults = { ...pizza, split: { mode: 'equal' as const, memberIds: [ANIA, BARTEK, KASIA] } };
    const moved = editedEntry(defaults, withDate(expenseFormFromEntry(defaults), '2026-07-12', members), context);
    expect(moved.ok && moved.value.split).toEqual({ mode: 'equal', memberIds: [ANIA, BARTEK, KASIA, TOMEK] });

    const picked = editedEntry(pizza, withDate(expenseFormFromEntry(pizza), '2026-07-12', members), context);
    expect(picked.ok && picked.value.split).toEqual({ mode: 'equal', memberIds: [ANIA, BARTEK] });
  });

  it('can turn an expense into an income', () => {
    const flipped = editedEntry(pizza, { ...expenseFormFromEntry(pizza), kind: 'income' }, context);
    expect(flipped.ok && flipped.value).toMatchObject({ kind: 'income', recipients: [{ memberId: BARTEK, amount: 12_345 }] });
  });

  it('reports invalid fields like the new expense form', () => {
    const r = editedEntry(pizza, { ...expenseFormFromEntry(pizza), amount: '', title: ' ' }, context);
    expect(r).toEqual({ ok: false, errors: ['amount', 'title'] });
  });
});

describe('amountForClipboard', () => {
  it('is the bare number in the locale, without currency or grouping', () => {
    expect(amountForClipboard(123_456, 'PLN', 'pl')).toBe('1234,56');
    expect(amountForClipboard(123_456, 'PLN', 'en')).toBe('1234.56');
    expect(amountForClipboard(5, 'EUR', 'en')).toBe('0.05');
    expect(amountForClipboard(1500, 'JPY', 'en')).toBe('1500');
  });
});

describe('versionConflictEntry', () => {
  const conflict = (statusCode: number, data: unknown) =>
    new DetailedError(`${statusCode}`, { statusCode, detail: { data, statusText: '' } });

  it("is the server's current entry from a 409 version conflict", () => {
    expect(versionConflictEntry(conflict(409, { error: 'version_conflict', entry: pizza }))).toEqual(pizza);
  });

  it('is null for any other error', () => {
    expect(versionConflictEntry(conflict(409, { error: 'conflict' }))).toBeNull();
    expect(versionConflictEntry(conflict(400, { error: 'invalid_entry' }))).toBeNull();
    expect(versionConflictEntry(new Error('offline'))).toBeNull();
  });
});

describe('entryActions', () => {
  const open = { archivedAt: null };

  it('offers Edytuj, Usuń, Historia, Kopiuj kwotę on an expense', () => {
    expect(entryActions(pizza, open)).toEqual(['edit', 'delete', 'history', 'copyAmount']);
  });

  it('offers the same actions on a settlement (Edytuj opens the settle sheet)', () => {
    const settlement = { ...pizza, kind: 'settlement' as const, from: ANIA, to: BARTEK };
    expect(entryActions(settlement, open)).toEqual(['edit', 'delete', 'history', 'copyAmount']);
    expect(entryActions(settlement, { archivedAt: '2026-08-01T00:00:00.000Z' })).toEqual(['history', 'copyAmount']);
  });

  it('only Historia and Kopiuj kwotę in an archived group', () => {
    expect(entryActions(pizza, { archivedAt: '2026-08-01T00:00:00.000Z' })).toEqual(['history', 'copyAmount']);
  });
});
