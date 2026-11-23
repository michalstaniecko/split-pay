import type { Entry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { activateLocale } from '../../i18n/i18n';
import { entryBubbleLabel } from './bubble-label';
import type { EntryItem } from './conversation';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
// Intl separates groups with (narrow) no-break spaces; normalise them.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

const dinner: Extract<Entry, { kind: 'expense' }> = {
  kind: 'expense',
  id: id(1),
  groupId: id(100),
  version: 1,
  createdBy: id(200),
  createdAt: '2026-07-11T19:00:00.000Z',
  updatedAt: '2026-07-11T19:00:00.000Z',
  deletedAt: null,
  date: '2026-07-11',
  amount: 2_000,
  currency: 'EUR',
  rateToBase: '4.3215',
  title: 'Kolacja',
  category: 'food',
  receiptPhotoId: null,
  payers: [{ memberId: id(3), amount: 2_000 }],
  split: { mode: 'equal', memberIds: [id(1), id(2), id(3)] },
};

const bubble = (overrides: Partial<EntryItem> = {}): EntryItem => ({
  type: 'entry',
  key: dinner.id,
  entry: dinner,
  side: 'start',
  payerName: 'Kasia',
  otherPayers: 0,
  myShare: 2_881,
  baseAmount: 8_643,
  ...overrides,
});

const label = (locale: 'pl' | 'en', item: EntryItem) => {
  activateLocale(locale);
  return plain(entryBubbleLabel(item, { baseCurrency: 'PLN', locale }));
};

describe('entryBubbleLabel', () => {
  it('reads a foreign-currency expense in Polish: the original amount with its currency name, then the base amount', () => {
    expect(label('pl', bubble())).toBe(
      'Wydatek 20,00 euro, czyli około 86,43 złotego polskiego: Kolacja. Zapłacił(a): Kasia. 11 lipca 2026. Twój udział 28,81 złotego polskiego.',
    );
  });

  it('reads a foreign-currency expense in English', () => {
    expect(label('en', bubble())).toBe(
      'Expense 20.00 euros, about 86.43 Polish zlotys: Kolacja. Paid by Kasia. July 11, 2026. Your share 28.81 Polish zlotys.',
    );
  });

  it('reads a base-currency expense without a converted amount, counting the other payers', () => {
    const pln = { ...dinner, amount: 4_550, currency: 'PLN', rateToBase: '1' };
    expect(label('en', bubble({ entry: pln, baseAmount: null, otherPayers: 2, myShare: null }))).toBe(
      'Expense 45.50 Polish zlotys: Kolacja. Paid by Kasia and 2 other people. July 11, 2026.',
    );
    expect(label('pl', bubble({ entry: pln, baseAmount: null, otherPayers: 2, myShare: null }))).toContain(
      'Zapłacił(a): Kasia i 2 inne osoby.',
    );
  });

  it('reads a foreign-currency income with its base amount', () => {
    const { payers, ...fields } = dinner;
    const refund: Entry = { ...fields, kind: 'income', amount: 10_000, title: 'Zwrot', recipients: payers };
    expect(label('pl', bubble({ entry: refund, baseAmount: 43_215, myShare: null }))).toBe(
      'Wpływ 100,00 euro, czyli około 432,15 złotego polskiego: Zwrot. Otrzymał(a): Kasia. 11 lipca 2026.',
    );
  });
});
