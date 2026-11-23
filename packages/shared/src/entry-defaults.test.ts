import { describe, expect, it } from 'vitest';
import { defaultEntryDate, equalExpenseDefaults } from './entry-defaults';
import { NewEntry } from './model';
import { ANIA, BARTEK, KASIA, TOMEK, ZOSIA, members, uuid } from './test-fixtures';

const trip = { startDate: '2026-07-10', endDate: '2026-07-14' };
const noDates = { startDate: null, endDate: null };

describe('defaultEntryDate', () => {
  it('is today in a group without dates', () => {
    expect(defaultEntryDate('2026-11-23', noDates)).toBe('2026-11-23');
  });

  it('is today when today is inside the trip', () => {
    expect(defaultEntryDate('2026-07-10', trip)).toBe('2026-07-10');
    expect(defaultEntryDate('2026-07-12', trip)).toBe('2026-07-12');
    expect(defaultEntryDate('2026-07-14', trip)).toBe('2026-07-14');
  });

  it('is the first trip day before the trip and the last one after it', () => {
    expect(defaultEntryDate('2026-06-01', trip)).toBe('2026-07-10');
    expect(defaultEntryDate('2026-11-23', trip)).toBe('2026-07-14');
  });
});

describe('equalExpenseDefaults', () => {
  const base = { id: uuid(900), title: ' Pizza ', amount: 10_000, currency: 'PLN', payerMemberId: ANIA, members };

  it('is paid by the payer in full, in the base currency, split equally among members present that day', () => {
    // On the 12th Zosia is away and Tomek is there.
    expect(equalExpenseDefaults({ ...base, date: '2026-07-12' })).toEqual({
      kind: 'expense',
      id: uuid(900),
      date: '2026-07-12',
      title: 'Pizza',
      amount: 10_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'food',
      receiptPhotoId: null,
      payers: [{ memberId: ANIA, amount: 10_000 }],
      split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA, TOMEK] },
    });
  });

  it('snapshots the participants as member ids (ADR-0016)', () => {
    const entry = equalExpenseDefaults({ ...base, date: '2026-07-10' });
    expect(entry.split).toEqual({ mode: 'equal', memberIds: [ANIA, BARTEK, KASIA, ZOSIA] });
  });

  it('takes an explicit category over the suggestion', () => {
    expect(equalExpenseDefaults({ ...base, date: '2026-07-10', category: 'other' }).category).toBe('other');
  });

  it('splits among everyone when nobody is present that day', () => {
    const away = members.map((m) => ({ ...m, attendance: [{ from: '2026-08-01', to: '2026-08-02' }] }));
    const entry = equalExpenseDefaults({ ...base, members: away, date: '2026-07-10' });
    expect(entry.split).toEqual({ mode: 'equal', memberIds: [ANIA, BARTEK, KASIA, TOMEK, ZOSIA] });
  });

  it('is a valid NewEntry', () => {
    expect(NewEntry.safeParse(equalExpenseDefaults({ ...base, date: '2026-07-10' })).success).toBe(true);
  });
});
