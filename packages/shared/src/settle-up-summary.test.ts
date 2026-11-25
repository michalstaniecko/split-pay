import { describe, expect, it } from 'vitest';
import type { Entry } from './model';
import { settleUp } from './settle-up';
import { settleUpSummary } from './settle-up-summary';
import { ANIA, KASIA, TOMEK, expense, income, members, settlement } from './test-fixtures';

// Intl separates groups and the currency symbol with (narrow) no-break spaces;
// normalise them so the expectations stay readable.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

const plLabels = { bankAccount: 'Nr konta', blikPhone: 'BLIK' };
const memberIds = members.map((m) => m.id);
const weekend = { name: 'Weekend w Zakopanem', baseCurrency: 'PLN', simplifyDebts: true };

type Input = Parameters<typeof settleUpSummary>[0];

const summary = (entries: Entry[], options: Partial<Input> & { simplifyDebts?: boolean } = {}) => {
  const { simplifyDebts = true, ...rest } = options;
  const group = { ...weekend, simplifyDebts };
  return plain(
    settleUpSummary({
      group,
      entries,
      members,
      settleUp: settleUp(entries, group, memberIds),
      locale: 'pl',
      labels: plLabels,
      ...rest,
    }),
  );
};

/** Kasia paid for a pizza shared with Tomek and a taxi shared with Ania. */
const pizzaAndTaxi = [
  expense({
    title: 'Pizza',
    amount: 12_000,
    payers: [{ memberId: KASIA, amount: 12_000 }],
    split: { mode: 'equal', memberIds: [KASIA, TOMEK] },
  }),
  expense({
    title: 'Taksówka',
    amount: 4_500,
    payers: [{ memberId: KASIA, amount: 4_500 }],
    split: {
      mode: 'exact',
      amounts: [
        { memberId: ANIA, amount: 1_200 },
        { memberId: KASIA, amount: 3_300 },
      ],
    },
  }),
];

describe('settleUpSummary', () => {
  it('lists the group name, the expenses with amounts and one line per transfer', () => {
    expect(summary(pizzaAndTaxi)).toBe(
      [
        'Weekend w Zakopanem',
        'Pizza 120,00 zł · Taksówka 45,00 zł',
        '',
        'Tomek → Kasia: 60,00 zł',
        'Ania → Kasia: 12,00 zł',
      ].join('\n'),
    );
  });

  it('lists only live expenses and the transfers left after recorded settlements', () => {
    const entries = [
      ...pizzaAndTaxi,
      expense({
        title: 'Usunięte',
        amount: 9_900,
        payers: [{ memberId: ANIA, amount: 9_900 }],
        split: { mode: 'equal', memberIds: [KASIA] },
        deletedAt: '2026-07-11T10:00:00Z',
      }),
      income({
        title: 'Zwrot kaucji',
        amount: 2_000,
        recipients: [{ memberId: KASIA, amount: 2_000 }],
        split: { mode: 'equal', memberIds: [KASIA, TOMEK] },
      }),
      settlement({ amount: 1_200, from: ANIA, to: KASIA }),
    ];
    expect(summary(entries)).toBe(
      ['Weekend w Zakopanem', 'Pizza 120,00 zł · Taksówka 45,00 zł', '', 'Tomek → Kasia: 50,00 zł'].join('\n'),
    );
  });

  it("puts the recipient's payout details under their transfer, only when they have them", () => {
    /** Tomek paid a dinner for Ania; Kasia paid the pizza and taxi. */
    const entries = [
      ...pizzaAndTaxi,
      expense({
        title: 'Kolacja',
        amount: 3_000,
        payers: [{ memberId: TOMEK, amount: 3_000 }],
        split: { mode: 'equal', memberIds: [ANIA] },
      }),
    ];
    const text = summary(entries, {
      simplifyDebts: false,
      payoutDetails: {
        [KASIA]: { bankAccount: '61109010140000071219812874', blikPhone: '+48600100200' },
        [TOMEK]: { bankAccount: null, blikPhone: null },
      },
    });
    expect(text).toBe(
      [
        'Weekend w Zakopanem',
        'Pizza 120,00 zł · Taksówka 45,00 zł · Kolacja 30,00 zł',
        '',
        'Ania → Kasia: 12,00 zł',
        '  Nr konta: 61 1090 1014 0000 0712 1981 2874',
        '  BLIK: +48600100200',
        'Ania → Tomek: 30,00 zł',
        'Tomek → Kasia: 60,00 zł',
        '  Nr konta: 61 1090 1014 0000 0712 1981 2874',
        '  BLIK: +48600100200',
      ].join('\n'),
    );
  });

  it('leaves out the expense line when there are no expenses', () => {
    const entries = [
      income({
        title: 'Zwrot kaucji',
        amount: 2_000,
        recipients: [{ memberId: KASIA, amount: 2_000 }],
        split: { mode: 'equal', memberIds: [KASIA, TOMEK] },
      }),
    ];
    expect(summary(entries)).toBe(['Weekend w Zakopanem', '', 'Kasia → Tomek: 10,00 zł'].join('\n'));
  });

  it('formats for the English locale, with foreign-currency expenses in the base currency', () => {
    const entries = [
      ...pizzaAndTaxi,
      expense({
        title: 'Museum',
        amount: 1_000,
        currency: 'EUR',
        rateToBase: '4.3',
        payers: [{ memberId: ANIA, amount: 1_000 }],
        split: { mode: 'equal', memberIds: [ANIA, TOMEK] },
      }),
    ];
    const text = summary(entries, {
      locale: 'en',
      labels: { bankAccount: 'Account no.', blikPhone: 'BLIK' },
      payoutDetails: { [KASIA]: { bankAccount: 'DE89370400440532013000', blikPhone: null } },
    });
    expect(text).toBe(
      [
        'Weekend w Zakopanem',
        'Pizza PLN 120.00 · Taksówka PLN 45.00 · Museum PLN 43.00',
        '',
        // Ania is owed 21.50 by Tomek and owes Kasia 12.00, so Tomek pays both.
        'Tomek → Kasia: PLN 72.00',
        '  Account no.: DE89 3704 0044 0532 0130 00',
        'Tomek → Ania: PLN 9.50',
      ].join('\n'),
    );
  });
});
