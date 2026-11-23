import { type CurrencyCode, ExchangeRate, type LocalDate } from '@split-pay/shared';

/** One ECB working day: units of each currency per 1 EUR (EUR itself not listed). */
export interface RateDay {
  date: LocalDate;
  perEur: Record<CurrencyCode, ExchangeRate>;
}

/**
 * Where the daily rate job gets ECB rates from (ADR-0014). Behind an interface
 * so tests never hit the network; production uses Frankfurter.
 */
export interface RateSource {
  /** The ECB days between `from` and `to` (inclusive) that have rates. */
  fetchDays(from: LocalDate, to: LocalDate): Promise<RateDay[]>;
}

/** Default Frankfurter instance; self-hostable, so the URL is configurable (`FRANKFURTER_URL`). */
export const DEFAULT_FRANKFURTER_URL = 'https://api.frankfurter.dev';

interface FrankfurterSeries {
  rates: Record<string, Record<string, number>>;
}

/** ECB rates from Frankfurter's time-series endpoint (`/v1/<from>..<to>`, base EUR). */
export function frankfurterRateSource(options: {
  baseUrl?: string | undefined;
  fetch?: (url: string) => Promise<Response>;
} = {}): RateSource {
  const baseUrl = (options.baseUrl ?? DEFAULT_FRANKFURTER_URL).replace(/\/+$/, '');
  const fetchUrl = options.fetch ?? ((url: string) => fetch(url));
  return {
    async fetchDays(from, to) {
      const res = await fetchUrl(`${baseUrl}/v1/${from}..${to}`);
      if (!res.ok) throw new Error(`Frankfurter ${from}..${to} → ${res.status}`);
      const body = (await res.json()) as FrankfurterSeries;
      return Object.entries(body.rates)
        .map(([date, rates]) => ({ date, perEur: toDecimalRates(rates) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

/**
 * Frankfurter sends rates as JSON numbers. ECB rates have at most 6
 * significant digits, so a number's shortest string form is exactly the
 * published decimal; anything that isn't a valid `ExchangeRate` is dropped.
 */
function toDecimalRates(rates: Record<string, number>): Record<CurrencyCode, ExchangeRate> {
  const result: Record<CurrencyCode, ExchangeRate> = {};
  for (const [currency, rate] of Object.entries(rates)) {
    const decimal = String(rate);
    if (/^[A-Z]{3}$/.test(currency) && ExchangeRate.safeParse(decimal).success) result[currency] = decimal;
  }
  return result;
}
