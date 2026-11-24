import type { Income } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { activateLocale } from '../../i18n/i18n';
import { incomeBubbleLabel } from './income-bubble-label';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const refund: Income = {
  kind: 'income',
  id: id(500),
  groupId: id(100),
  version: 1,
  createdBy: id(200),
  createdAt: '2026-07-14T10:00:00.000Z',
  updatedAt: '2026-07-14T10:00:00.000Z',
  deletedAt: null,
  date: '2026-07-14',
  amount: 40_000,
  currency: 'PLN',
  rateToBase: '1',
  title: 'Zwrot kaucji',
  category: 'accommodation',
  receiptPhotoId: null,
  recipients: [{ memberId: id(3), amount: 40_000 }],
  split: { mode: 'equal', memberIds: [id(1), id(2), id(3), id(4)] },
};

// Intl separates groups with (narrow) no-break spaces; normalise them.
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const label = (locale: 'pl' | 'en', item: { payerName?: string; otherPayers?: number; myShare?: number | null }) => {
  activateLocale(locale);
  return plain(
    incomeBubbleLabel(
      { entry: refund, payerName: item.payerName ?? 'Kasia', otherPayers: item.otherPayers ?? 0, myShare: item.myShare ?? null },
      { baseCurrency: 'PLN', locale },
    ),
  );
};

describe('incomeBubbleLabel', () => {
  it('reads an income with its recipient, amount with the currency name, title, date and my share (PL)', () => {
    expect(label('pl', { myShare: -10_000 })).toBe(
      'Wpływ 400,00 złotego polskiego: Zwrot kaucji. Dla: Kasia. 14 lipca 2026. Twój udział 100,00 złotego polskiego.',
    );
  });

  it('reads an income in English', () => {
    expect(label('en', { myShare: -10_000 })).toBe(
      'Income 400.00 Polish zlotys: Zwrot kaucji. Received by Kasia. July 14, 2026. Your share 100.00 Polish zlotys.',
    );
  });

  it('counts the other recipients with Polish plural forms', () => {
    expect(label('pl', { otherPayers: 1 })).toContain('Dla: Kasia i 1 inna osoba.');
    expect(label('pl', { otherPayers: 3 })).toContain('Dla: Kasia i 3 inne osoby.');
    expect(label('pl', { otherPayers: 5 })).toContain('Dla: Kasia i 5 innych osób.');
  });

  it('counts the other recipients with English plural forms', () => {
    expect(label('en', { otherPayers: 1 })).toContain('Received by Kasia and 1 other person.');
    expect(label('en', { otherPayers: 2 })).toContain('Received by Kasia and 2 other people.');
  });

  it('leaves my share out when I have none or am not a member', () => {
    expect(label('pl', { myShare: 0 })).toBe('Wpływ 400,00 złotego polskiego: Zwrot kaucji. Dla: Kasia. 14 lipca 2026.');
    expect(label('en', { myShare: null })).toBe('Income 400.00 Polish zlotys: Zwrot kaucji. Received by Kasia. July 14, 2026.');
  });
});
