import type { Expense, Member } from '@split-pay/shared';
import { DetailedError } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { amountForClipboard, editedExpense, entryActions, expenseFormFromEntry, versionConflictEntry } from './entry-edit';

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

describe('expenseFormFromEntry', () => {
  it('opens the form with the entry as entered', () => {
    expect(expenseFormFromEntry(pizza)).toEqual({
      amount: '123.45',
      title: 'Pizza',
      payerMemberId: BARTEK,
      date: '2026-07-11',
      category: 'food',
      categoryChosen: true,
    });
  });

  it('writes whole amounts without decimals and picks the largest payer', () => {
    const shared = { ...pizza, amount: 10_000, payers: [{ memberId: ANIA, amount: 3_000 }, { memberId: BARTEK, amount: 7_000 }] };
    expect(expenseFormFromEntry(shared)).toMatchObject({ amount: '100', payerMemberId: BARTEK });
    expect(expenseFormFromEntry({ ...pizza, amount: 5, currency: 'PLN' }).amount).toBe('0.05');
  });
});

describe('editedExpense', () => {
  const context = { group, members };

  it('keeps what the form does not show: the split participants, the receipt, the id', () => {
    const r = editedExpense(pizza, { ...expenseFormFromEntry(pizza), title: 'Pizza i napoje', amount: '150' }, context);
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

  it('moves default participants along with a new date, hand-picked ones stay', () => {
    const defaults = { ...pizza, split: { mode: 'equal' as const, memberIds: [ANIA, BARTEK, KASIA] } };
    const moved = editedExpense(defaults, { ...expenseFormFromEntry(defaults), date: '2026-07-12' }, context);
    expect(moved.ok && moved.value.split).toEqual({ mode: 'equal', memberIds: [ANIA, BARTEK, KASIA, TOMEK] });

    const picked = editedExpense(pizza, { ...expenseFormFromEntry(pizza), date: '2026-07-12' }, context);
    expect(picked.ok && picked.value.split).toEqual({ mode: 'equal', memberIds: [ANIA, BARTEK] });
  });

  it('keeps several payers while amount and payer are untouched; one payer otherwise', () => {
    const shared = { ...pizza, amount: 10_000, payers: [{ memberId: ANIA, amount: 3_000 }, { memberId: BARTEK, amount: 7_000 }] };
    const retitled = editedExpense(shared, { ...expenseFormFromEntry(shared), title: 'Kolacja' }, context);
    expect(retitled.ok && retitled.value.payers).toEqual(shared.payers);

    const repaid = editedExpense(shared, { ...expenseFormFromEntry(shared), payerMemberId: ANIA }, context);
    expect(repaid.ok && repaid.value.payers).toEqual([{ memberId: ANIA, amount: 10_000 }]);
  });

  it('reports invalid fields like the new expense form', () => {
    const r = editedExpense(pizza, { ...expenseFormFromEntry(pizza), amount: '', title: ' ' }, context);
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

  it('has no Edytuj where the full form cannot edit the kind yet', () => {
    expect(entryActions({ kind: 'settlement' }, open)).toEqual(['delete', 'history', 'copyAmount']);
  });

  it('only Historia and Kopiuj kwotę in an archived group', () => {
    expect(entryActions(pizza, { archivedAt: '2026-08-01T00:00:00.000Z' })).toEqual(['history', 'copyAmount']);
  });
});
