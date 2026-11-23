import {
  type CurrencyCode,
  formatAmount,
  formatDate,
  type LocalDate,
  type MinorAmount,
} from '@split-pay/shared';
import { useLocale } from './locale-provider';

/** Amount and date formatting bound to the active UI language. */
export function useFormatters() {
  const { locale } = useLocale();
  return {
    /** Minor units in (ADR-0003), localised currency string out. */
    amount: (amount: MinorAmount, currency: CurrencyCode) => formatAmount(amount, currency, locale),
    date: (date: LocalDate) => formatDate(date, locale),
  };
}
