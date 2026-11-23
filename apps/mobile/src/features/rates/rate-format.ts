import type { ExchangeRate } from '@split-pay/shared';

/**
 * A rate (decimal string) as shown to the user: every stored digit, with the
 * locale's decimal separator ("4,3215" in Polish). Not run through
 * `Intl.NumberFormat`, which would round it as a float.
 */
export function formatRate(rate: ExchangeRate, locale: string): string {
  const separator = new Intl.NumberFormat(locale).formatToParts(0.5).find((p) => p.type === 'decimal')?.value ?? '.';
  return rate.replace('.', separator);
}
