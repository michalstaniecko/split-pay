import { z } from 'zod';
import { LocalDate } from './model';
import { CurrencyCode, ExchangeRate } from './money';

/**
 * Exchange rates (ADR-0014): the ECB publishes units of each currency per
 * 1 EUR on working days; the server stores those and derives the rates to a
 * group's base currency from them. All arithmetic on decimal strings (BigInt),
 * never floats (ADR-0003).
 */

/** Significant digits of a derived (cross) rate — about what the ECB publishes. */
const SIGNIFICANT_DIGITS = 6;
/** `ExchangeRate` allows at most 10 decimal places. */
const MAX_FRACTION_DIGITS = 10;

function parseDecimal(rate: ExchangeRate): { units: bigint; scale: number } {
  ExchangeRate.parse(rate);
  const [intPart, fracPart = ''] = rate.split('.');
  return { units: BigInt(`${intPart}${fracPart}`), scale: fracPart.length };
}

/**
 * `numerator / denominator` of two positive decimal rates, rounded half away
 * from zero to six significant digits (at most 10 decimal places), trailing
 * zeros trimmed. E.g. PLN per USD = crossRate(PLN per EUR, USD per EUR).
 */
export function crossRate(numerator: ExchangeRate, denominator: ExchangeRate): ExchangeRate {
  const a = parseDecimal(numerator);
  const b = parseDecimal(denominator);
  // value = (a.units / 10^a.scale) / (b.units / 10^b.scale) = n / d
  const n = a.units * 10n ** BigInt(b.scale);
  const d = b.units * 10n ** BigInt(a.scale);

  // Number of integer digits of the value (≤ 0 for values below 1: minus the leading zeros after the point).
  let magnitude: number;
  const intPart = n / d;
  if (intPart > 0n) {
    magnitude = intPart.toString().length;
  } else {
    magnitude = 0;
    while (n * 10n ** BigInt(1 - magnitude) < d) magnitude -= 1;
  }
  const fractionDigits = Math.min(MAX_FRACTION_DIGITS, Math.max(0, SIGNIFICANT_DIGITS - magnitude));
  const scaled = n * 10n ** BigInt(fractionDigits);
  const rounded = (2n * scaled + d) / (2n * d);
  if (rounded === 0n) throw new RangeError('Rate too small to represent');

  const digits = rounded.toString().padStart(fractionDigits + 1, '0');
  const whole = digits.slice(0, digits.length - fractionDigits);
  const fraction = digits.slice(digits.length - fractionDigits).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * Rates to a base currency from the ECB's per-EUR rates: units of `base` per
 * 1 unit of each currency (the entry's `rateToBase`). EUR and `base` itself
 * (rate "1") are included. `null` when the ECB has no rate for `base`.
 */
export function ratesToBase(
  perEur: Readonly<Record<string, ExchangeRate>>,
  base: CurrencyCode,
): Record<CurrencyCode, ExchangeRate> | null {
  const all: Record<string, ExchangeRate> = { EUR: '1', ...perEur };
  const basePerEur = all[base];
  if (basePerEur === undefined) return null;
  return Object.fromEntries(
    Object.entries(all).map(([currency, perEurRate]) => [
      currency,
      currency === base ? '1' : crossRate(basePerEur, perEurRate),
    ]),
  );
}

/**
 * The rate day to use for a date: that date, else the latest earlier one
 * (the ECB publishes no rates on weekends and holidays, and today's only in
 * the afternoon). `undefined` when every known day is later.
 */
export function pickRateDay<T extends { date: LocalDate }>(days: readonly T[], date: LocalDate): T | undefined {
  let best: T | undefined;
  for (const day of days) {
    if (day.date <= date && (best === undefined || day.date > best.date)) best = day;
  }
  return best;
}

/**
 * Rates for a date as the API returns them (`GET /rates/:date?base=`):
 * `rates[c]` = units of `base` per 1 unit of `c`. `ratesDate` is the ECB day
 * the rates come from (the requested date or the latest earlier one).
 */
export const RateTable = z.object({
  base: CurrencyCode,
  date: LocalDate,
  ratesDate: LocalDate,
  rates: z.record(CurrencyCode, ExchangeRate),
});
export type RateTable = z.infer<typeof RateTable>;
