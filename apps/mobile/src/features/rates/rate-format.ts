import type { ExchangeRate } from '@split-pay/shared';
import { decimalSeparator } from '../../i18n/locale';

/**
 * A rate (decimal string) as shown to the user: every stored digit, with the
 * locale's decimal separator ("4,3215" in Polish). Not run through
 * `Intl.NumberFormat`, which would round it as a float.
 */
export function formatRate(rate: ExchangeRate, locale: string): string {
  return rate.replace('.', decimalSeparator(locale));
}
