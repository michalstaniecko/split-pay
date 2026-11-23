import type { LocalDate } from './model';
import { type CurrencyCode, type MinorAmount, minorUnitDigits } from './money';

/**
 * Formats an amount in minor units (ADR-0003) as a localised currency string,
 * e.g. `formatAmount(1234567, 'PLN', 'pl')` → "12 345,67 zł".
 * The minor units are turned into a decimal string without float arithmetic.
 * `currencyDisplay: 'name'` spells the currency for screen readers
 * ("20,00 euro", "86.43 Polish zlotys").
 */
export function formatAmount(
  amount: MinorAmount,
  currency: CurrencyCode,
  locale: string,
  options: { currencyDisplay?: 'symbol' | 'name' } = {},
): string {
  const digits = minorUnitDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: options.currencyDisplay ?? 'symbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    // Intl.NumberFormat v3 (ES2023) formats decimal strings exactly; the ES2022
    // lib typings only know the number overload.
  }).format(toDecimalString(amount, digits) as unknown as number);
}

/** 1234567, 2 → "12345.67"; -5, 2 → "-0.05"; 500, 0 → "500". */
function toDecimalString(amount: MinorAmount, digits: number): string {
  if (!Number.isSafeInteger(amount)) throw new RangeError('Amount must be a safe integer');
  const sign = amount < 0 ? '-' : '';
  const abs = String(Math.abs(amount)).padStart(digits + 1, '0');
  if (digits === 0) return sign + abs;
  return `${sign}${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
}

/**
 * Formats a calendar date ("YYYY-MM-DD", see `LocalDate`) in the given locale,
 * e.g. `formatDate('2026-11-23', 'pl')` → "23 listopada 2026". The date has no
 * time zone, so it is formatted in UTC and never shifts by a day.
 */
export function formatDate(date: LocalDate, locale: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
