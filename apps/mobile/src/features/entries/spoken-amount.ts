import { t } from '@lingui/core/macro';
import { type CurrencyCode, type Entry, formatAmount } from '@split-pay/shared';

/**
 * An entry's amount for screen readers, the currency spelled out. A
 * foreign-currency entry reads the original amount, then the base amount
 * ("20,00 euro, czyli około 86,43 złotego polskiego").
 */
export function spokenEntryAmount(
  entry: Pick<Entry, 'amount' | 'currency'>,
  baseAmount: number | null,
  context: { baseCurrency: CurrencyCode; locale: string },
): string {
  const spoken = (amount: number, currency: CurrencyCode) =>
    formatAmount(amount, currency, context.locale, { currencyDisplay: 'name' });
  const original = spoken(entry.amount, entry.currency);
  if (baseAmount === null) return original;
  const base = spoken(baseAmount, context.baseCurrency);
  return t`${original}, czyli około ${base}`;
}
