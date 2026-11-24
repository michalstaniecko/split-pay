import { t } from '@lingui/core/macro';
import type { CurrencyCode, Entry } from '@split-pay/shared';
import { createFormatters } from '../../i18n/formatters';

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
  const { spokenAmount } = createFormatters(context.locale);
  const original = spokenAmount(entry.amount, entry.currency);
  if (baseAmount === null) return original;
  const base = spokenAmount(baseAmount, context.baseCurrency);
  return t`${original}, czyli około ${base}`;
}
