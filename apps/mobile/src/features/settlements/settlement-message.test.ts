import type { Member, Settlement } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { activateLocale } from '../../i18n/i18n';
import { settlementMessage } from './settlement-message';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const ANIA = id(1);
const BARTEK = id(2);
const member = (memberId: string, displayName: string): Member & { displayName: string } => ({
  id: memberId,
  groupId: id(100),
  displayName,
  userId: null,
  attendance: null,
});
const members = [member(ANIA, 'Ania'), member(BARTEK, 'Bartek')];

const settlement: Settlement = {
  kind: 'settlement',
  id: id(500),
  groupId: id(100),
  version: 1,
  createdBy: id(200),
  createdByMember: null,
  createdAt: '2026-07-12T10:00:00.000Z',
  updatedAt: '2026-07-12T10:00:00.000Z',
  deletedAt: null,
  date: '2026-07-12',
  amount: 3_050,
  currency: 'PLN',
  rateToBase: '1',
  from: BARTEK,
  to: ANIA,
};

// Intl separates groups with (narrow) no-break spaces; normalise them.
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const message = (locale: 'pl' | 'en', myMemberId: string | null) => {
  activateLocale(locale);
  const { text, label } = settlementMessage(settlement, { members, myMemberId, locale });
  return { text: plain(text), label: plain(label) };
};

describe('settlementMessage', () => {
  it('shows who paid whom and how much, read with the currency name and the date (PL)', () => {
    expect(message('pl', null)).toEqual({
      text: 'Spłata: Bartek → Ania · 30,50 zł',
      label: 'Spłata 30,50 złotego polskiego. Od: Bartek. Dla: Ania. 12 lipca 2026.',
    });
  });

  it('calls me "Ty" on either side', () => {
    expect(message('pl', BARTEK).text).toBe('Spłata: Ty → Ania · 30,50 zł');
    expect(message('pl', ANIA).text).toBe('Spłata: Bartek → Ty · 30,50 zł');
    expect(message('pl', ANIA).label).toBe('Spłata 30,50 złotego polskiego. Od: Bartek. Dla: Ty. 12 lipca 2026.');
  });

  it('reads a settlement in English', () => {
    expect(message('en', BARTEK)).toEqual({
      text: 'Settlement: You → Ania · PLN 30.50',
      label: 'Settlement 30.50 Polish zlotys. From: You. To: Ania. July 12, 2026.',
    });
  });
});
