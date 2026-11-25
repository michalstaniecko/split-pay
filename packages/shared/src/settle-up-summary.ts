import { formatAmount } from './format';
import type { Entry, Expense, Member } from './model';
import { type CurrencyCode, convert } from './money';
import { type PayoutDetails, formatBankAccount } from './payout-details';
import type { SettleUp } from './settle-up';

/** Translated labels the summary needs, so `shared` stays free of i18n. */
export interface SettleUpSummaryLabels {
  /** Precedes the recipient's bank account number, e.g. "Nr konta". */
  bankAccount: string;
  /** Precedes the recipient's BLIK phone number, e.g. "BLIK". */
  blikPhone: string;
}

export interface SettleUpSummaryInput {
  group: { name: string; baseCurrency: CurrencyCode };
  /** The group's entries; only live expenses are listed in the header. */
  entries: readonly Entry[];
  members: readonly Pick<Member, 'id' | 'displayName'>[];
  /** The `settleUp()` result for the same entries. */
  settleUp: Pick<SettleUp, 'transfers'>;
  /** Payout details per member id (synced groups); shown under transfers to that member. */
  payoutDetails?: Readonly<Record<string, PayoutDetails>>;
  /** The UI locale, for `Intl` formatting. */
  locale: string;
  labels: SettleUpSummaryLabels;
}

/**
 * The settle-up summary (GLOSSARY): a plain-text message with the group name,
 * its expenses and the transfers still to make, in the base currency.
 */
export function settleUpSummary(input: SettleUpSummaryInput): string {
  const { group, entries, members, settleUp, payoutDetails, locale, labels } = input;
  const money = (amount: number) => formatAmount(amount, group.baseCurrency, locale);
  const name = (memberId: string) => members.find((m) => m.id === memberId)?.displayName ?? '?';

  const expenses = entries
    .filter((e): e is Expense => e.kind === 'expense' && e.deletedAt === null)
    .map((e) => `${e.title} ${money(convert(e.amount, e.rateToBase, e.currency, group.baseCurrency))}`);
  const transfers = settleUp.transfers.flatMap((t) => {
    const details = payoutDetails?.[t.to];
    return [
      `${name(t.from)} → ${name(t.to)}: ${money(t.amount)}`,
      ...(details?.bankAccount ? [`  ${labels.bankAccount}: ${formatBankAccount(details.bankAccount)}`] : []),
      ...(details?.blikPhone ? [`  ${labels.blikPhone}: ${details.blikPhone}`] : []),
    ];
  });

  const header = expenses.length > 0 ? [group.name, expenses.join(' · ')] : [group.name];
  return [...header, '', ...transfers].join('\n');
}
