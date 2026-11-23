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
    /** An ISO timestamp in the device's time zone, e.g. "23 lis 2026, 14:05". */
    dateTime: (iso: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
  };
}
