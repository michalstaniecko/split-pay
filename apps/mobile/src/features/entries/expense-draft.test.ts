import type { Member } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import {
  canSendComposer,
  composerExpense,
  entryCurrencies,
  expenseFormFromComposer,
  formBaseAmount,
  parseExpenseForm,
  todayLocalDate,
  withCurrency,
  withRate,
  withSuggestedRate,
  withTitle,
} from './expense-draft';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const GROUP = id(100);
const ANIA = id(1);
const BARTEK = id(2);
const TOMEK = id(4);
const ENTRY = id(500);
const member = (memberId: string, displayName: string, attendance: Member['attendance'] = null): Member => ({
  id: memberId,
  groupId: GROUP,
  displayName,
  userId: null,
  attendance,
});
// Tomek arrives on the 12th.
const members = [member(ANIA, 'Ania'), member(BARTEK, 'Bartek'), member(TOMEK, 'Tomek', [{ from: '2026-07-12', to: '2026-07-14' }])];
const trip = { id: GROUP, baseCurrency: 'PLN', startDate: '2026-07-10', endDate: '2026-07-14' };

describe('todayLocalDate', () => {
  it("is the device's local calendar date", () => {
    expect(todayLocalDate(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
    expect(todayLocalDate(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });
});

describe('canSendComposer', () => {
  it('needs an amount > 0 and a non-empty title', () => {
    expect(canSendComposer({ amount: '12,5', title: 'Pizza' }, 2)).toBe(true);
    expect(canSendComposer({ amount: '0', title: 'Pizza' }, 2)).toBe(false);
    expect(canSendComposer({ amount: '', title: 'Pizza' }, 2)).toBe(false);
    expect(canSendComposer({ amount: '12', title: '  ' }, 2)).toBe(false);
  });
});

describe('composerExpense', () => {
  it('is paid by me, on the default date, split equally among those present, category from the title', () => {
    const expense = composerExpense({
      draft: { amount: '120,00', title: 'Pizza' },
      id: ENTRY,
      group: trip,
      members,
      myMemberId: ANIA,
      today: '2026-07-11',
    });
    expect(expense).toMatchObject({
      kind: 'expense',
      id: ENTRY,
      date: '2026-07-11',
      title: 'Pizza',
      amount: 12_000,
      currency: 'PLN',
      category: 'food',
      payers: [{ memberId: ANIA, amount: 12_000 }],
      split: { mode: 'equal', memberIds: [ANIA, BARTEK] },
    });
  });

  it('after the trip uses its last day, which also decides who is present', () => {
    const expense = composerExpense({
      draft: { amount: '30', title: 'Taxi' },
      id: ENTRY,
      group: trip,
      members,
      myMemberId: ANIA,
      today: '2026-11-23',
    });
    expect(expense).toMatchObject({ date: '2026-07-14', split: { memberIds: [ANIA, BARTEK, TOMEK] } });
  });

  it('is null when the draft cannot be sent or I am not a member', () => {
    const input = { id: ENTRY, group: trip, members, today: '2026-07-11' };
    expect(composerExpense({ ...input, draft: { amount: '', title: 'x' }, myMemberId: ANIA })).toBeNull();
    expect(composerExpense({ ...input, draft: { amount: '5', title: 'x' }, myMemberId: null })).toBeNull();
  });
});

describe('expense form', () => {
  const form = expenseFormFromComposer({
    draft: { amount: '45,5', title: 'Paliwo' },
    group: trip,
    myMemberId: ANIA,
    today: '2026-07-11',
  });

  it('is prefilled from the composer with me as payer, the default date and the suggested category', () => {
    expect(form).toEqual({
      amount: '45,5',
      title: 'Paliwo',
      payerMemberId: ANIA,
      date: '2026-07-11',
      category: 'fuel',
      categoryChosen: false,
      currency: 'PLN',
      rate: '1',
      rateEdited: false,
    });
  });

  it('keeps suggesting the category from the title until the user picks one', () => {
    expect(withTitle(form, 'Pizza').category).toBe('food');
    expect(withTitle({ ...form, category: 'other', categoryChosen: true }, 'Pizza').category).toBe('other');
  });

  it('builds an equal-split expense; the date decides who is present', () => {
    const parsed = parseExpenseForm({ ...form, payerMemberId: BARTEK, date: '2026-07-13' }, { id: ENTRY, group: trip, members });
    expect(parsed).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: 4550,
        category: 'fuel',
        date: '2026-07-13',
        payers: [{ memberId: BARTEK, amount: 4550 }],
        split: { mode: 'equal', memberIds: [ANIA, BARTEK, TOMEK] },
      }),
    });
  });

  it('lists invalid fields in form order', () => {
    const parsed = parseExpenseForm(
      { ...form, amount: '0', title: ' ', date: '2026-13-40', payerMemberId: '' },
      { id: ENTRY, group: trip, members },
    );
    expect(parsed).toEqual({ ok: false, errors: ['amount', 'title', 'payer', 'date'] });
  });
});

describe('expense form in a foreign currency', () => {
  const form = expenseFormFromComposer({
    draft: { amount: '20,505', title: 'Kolacja' },
    group: trip,
    myMemberId: ANIA,
    today: '2026-07-11',
  });
  const eur = withCurrency(form, 'EUR', 'PLN');

  it('picking a currency clears the rate until the ECB rate arrives; the base currency has rate 1', () => {
    expect(eur).toMatchObject({ currency: 'EUR', rate: '', rateEdited: false });
    expect(withCurrency(withRate(eur, '4,5'), 'PLN', 'PLN')).toMatchObject({ currency: 'PLN', rate: '1', rateEdited: false });
  });

  it("trims the amount to the new currency's minor digits", () => {
    expect(withCurrency({ ...form, amount: '1200,50' }, 'JPY', 'PLN').amount).toBe('1200');
  });

  it('prefills the suggested rate until the user edits it', () => {
    expect(withSuggestedRate(eur, '4.3157').rate).toBe('4.3157');
    expect(withSuggestedRate(withRate(eur, '4,30'), '4.3157').rate).toBe('4,30');
  });

  it('shows the amount in the base currency at the typed rate', () => {
    expect(formBaseAmount({ ...withRate(eur, '4,3157'), amount: '20' }, 'PLN')).toBe(8_631);
    expect(formBaseAmount({ ...eur, amount: '20' }, 'PLN')).toBeNull();
    expect(formBaseAmount(form, 'PLN')).toBeNull();
  });

  it('builds the expense in the entry currency with the frozen rate as a decimal string', () => {
    const parsed = parseExpenseForm({ ...withRate(eur, '4,3157'), amount: '20,50' }, { id: ENTRY, group: trip, members });
    expect(parsed).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: 2050,
        currency: 'EUR',
        rateToBase: '4.3157',
        payers: [{ memberId: ANIA, amount: 2050 }],
      }),
    });
  });

  it('rejects a missing or invalid rate', () => {
    const context = { id: ENTRY, group: trip, members };
    expect(parseExpenseForm({ ...eur, amount: '20' }, context)).toEqual({ ok: false, errors: ['rate'] });
    expect(parseExpenseForm({ ...withRate(eur, '0'), amount: '20' }, context)).toEqual({ ok: false, errors: ['rate'] });
    expect(parseExpenseForm({ ...withRate(eur, '4.3.1'), amount: '20' }, context)).toEqual({ ok: false, errors: ['rate'] });
  });
});

describe('entryCurrencies', () => {
  it('offers the base currency first, then the others once', () => {
    const list = entryCurrencies('PLN');
    expect(list[0]).toBe('PLN');
    expect(list).toContain('EUR');
    expect(new Set(list).size).toBe(list.length);
    expect(entryCurrencies('MXN')[0]).toBe('MXN');
  });
});
