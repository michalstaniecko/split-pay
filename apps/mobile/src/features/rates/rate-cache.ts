import { type CurrencyCode, type LocalDate, pickRateDay, RateTable } from '@split-pay/shared';

/**
 * Rates the app fetched (GET /rates/:date), kept on the device so the full
 * expense form can prefill a rate offline (SPEC "Currencies"). One table per
 * base currency and ECB day; only the latest days of each base are kept.
 */
export type RateCache = RateTable[];

const DAYS_PER_BASE = 14;

const byBaseAndDay = (a: RateTable, b: RateTable) => a.base.localeCompare(b.base) || a.ratesDate.localeCompare(b.ratesDate);

/** The cache with a freshly fetched table added (replacing the same base + ECB day). */
export function rememberRates(cache: RateCache, table: RateTable, daysPerBase = DAYS_PER_BASE): RateCache {
  const others = cache.filter((t) => t.base !== table.base);
  const sameBase = cache.filter((t) => t.base === table.base && t.ratesDate !== table.ratesDate);
  const kept = [...sameBase, table].sort(byBaseAndDay).slice(-daysPerBase);
  return [...others, ...kept].sort(byBaseAndDay);
}

/**
 * Cached rates for an entry date: the cached ECB day for that date or the
 * latest earlier one; for a date older than everything cached, the last
 * cached rates. `undefined` when nothing is cached for the base currency.
 */
export function cachedRates(cache: RateCache, base: CurrencyCode, date: LocalDate): RateTable | undefined {
  const tables = cache.filter((t) => t.base === base).map((t) => ({ ...t, date: t.ratesDate }));
  const picked = pickRateDay(tables, date) ?? tables.sort(byBaseAndDay).at(-1);
  return picked ? cache.find((t) => t.base === base && t.ratesDate === picked.ratesDate) : undefined;
}

/** The stored cache; malformed tables (or storage) are dropped. */
export function parseRateCache(stored: string | null): RateCache {
  if (stored === null) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t) => {
    const parsed = RateTable.safeParse(t);
    return parsed.success ? [parsed.data] : [];
  });
}
