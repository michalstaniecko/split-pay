import {
  type CurrencyCode,
  formatAmount,
  formatDate,
  formatDayParts,
  type LocalDate,
  type MinorAmount,
} from '@split-pay/shared';

/** Amount and date formatting bound to `locale`; in components use `useFormatters()`. */
export function createFormatters(locale: string) {
  return {
    /** Minor units in (ADR-0003), localised currency string out. */
    amount: (amount: MinorAmount, currency: CurrencyCode) => formatAmount(amount, currency, locale),
    /** For screen readers: the currency name spelled out, e.g. "45,50 złotego polskiego". */
    spokenAmount: (amount: MinorAmount, currency: CurrencyCode) =>
      formatAmount(amount, currency, locale, { currencyDisplay: 'name' }),
    date: (date: LocalDate) => formatDate(date, locale),
    /** Short weekday, day of month and month, e.g. `{ weekday: 'pon.', day: '23', month: 'lis' }`. */
    dayParts: (date: LocalDate) => formatDayParts(date, locale),
    /** An ISO timestamp in the device's time zone, e.g. "23 lis 2026, 14:05". */
    dateTime: (iso: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
  };
}

export type Formatters = ReturnType<typeof createFormatters>;
