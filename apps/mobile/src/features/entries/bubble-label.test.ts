import type { Entry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { activateLocale } from '../../i18n/i18n';
import { entryBubbleLabel } from './bubble-label';
import type { EntryItem } from './conversation';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const plain = (s: string) => s.replace(/[  ]/g, ' ');

const dinner: Entry = {
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

describe('entryBubbleLabel', () => {
  it('reads a foreign-currency bubble in Polish: original amount with its currency name, then the base amount', () => {
    activateLocale('pl');
    expect(plain(entryBubbleLabel(bubble(), { baseCurrency: 'PLN', locale: 'pl' }))).toBe(
      'Kasia, Kolacja, 20,00 euro, czyli około 86,43 złotego polskiego, twój udział 28,81 złotego polskiego',
    );
  });

  it('reads a foreign-currency bubble in English', () => {
    activateLocale('en');
    expect(plain(entryBubbleLabel(bubble(), { baseCurrency: 'PLN', locale: 'en' }))).toBe(
      'Kasia, Kolacja, 20.00 euros, about 86.43 Polish zlotys, your share 28.81 Polish zlotys',
    );
  });

  it('reads a base-currency bubble without the converted amount, and counts other payers', () => {
    activateLocale('en');
    const pln = { ...dinner, amount: 4_550, currency: 'PLN', rateToBase: '1' };
    expect(
      plain(entryBubbleLabel(bubble({ entry: pln, baseAmount: null, otherPayers: 2, myShare: null }), { baseCurrency: 'PLN', locale: 'en' })),
    ).toBe('Kasia + 2, Kolacja, 45.50 Polish zlotys');
  });
});
