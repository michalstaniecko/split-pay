import { t } from '@lingui/core/macro';
import { type CurrencyCode, formatAmount } from '@split-pay/shared';
import type { EntryItem } from './conversation';

/**
 * The screen-reader label of a bubble — the bubble is one accessible element
 * (#36). Amounts are read with the currency's name; a foreign-currency
 * bubble reads the original amount, then the base amount ("20,00 euro,
 * czyli około 86,43 złotego polskiego"). Uses the active Lingui locale;
 * `locale` formats the amounts.
 * TODO(#36): the full sentence (payer's verb, date) replaces this list.
 */
export function entryBubbleLabel(
  item: EntryItem,
  context: { baseCurrency: CurrencyCode; locale: string },
): string {
  const { entry, payerName, otherPayers, myShare, baseAmount } = item;
  const spoken = (amount: number, currency: CurrencyCode) =>
    formatAmount(amount, currency, context.locale, { currencyDisplay: 'name' });

  const author = otherPayers > 0 ? t`${payerName} + ${otherPayers}` : payerName;
  const title = entry.kind === 'settlement' ? t`Spłata` : entry.title;
  const original = spoken(entry.amount, entry.currency);
  const amount =
    baseAmount === null ? original : t`${original}, czyli około ${spoken(baseAmount, context.baseCurrency)}`;
  const share = myShare !== null && myShare !== 0 ? t`twój udział ${spoken(myShare, context.baseCurrency)}` : null;
  return [author, title, amount, share].filter(Boolean).join(', ');
}
