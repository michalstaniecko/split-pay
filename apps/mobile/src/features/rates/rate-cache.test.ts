import type { RateTable } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { cachedRates, parseRateCache, rememberRates } from './rate-cache';

const table = (base: string, ratesDate: string, eur: string, date = ratesDate): RateTable => ({
  base,
  date,
  ratesDate,
  rates: { EUR: eur, [base]: '1' },
});

describe('rememberRates', () => {
  it('keeps one table per base currency and ECB day, the newest fetch winning', () => {
    const cache = rememberRates([table('PLN', '2026-07-10', '4.30')], table('PLN', '2026-07-10', '4.31', '2026-07-12'));
    expect(cache).toEqual([table('PLN', '2026-07-10', '4.31', '2026-07-12')]);
  });

  it('keeps only the latest ECB days of each base currency', () => {
    let cache: RateTable[] = [table('EUR', '2026-06-01', '1')];
    for (let day = 1; day <= 20; day++) {
      cache = rememberRates(cache, table('PLN', `2026-07-${String(day).padStart(2, '0')}`, '4.3'), 3);
    }
    expect(cache.map((t) => `${t.base} ${t.ratesDate}`)).toEqual([
      'EUR 2026-06-01',
      'PLN 2026-07-18',
      'PLN 2026-07-19',
      'PLN 2026-07-20',
    ]);
  });
});

describe('cachedRates (offline)', () => {
  const cache = [table('PLN', '2026-07-09', '4.25'), table('PLN', '2026-07-10', '4.31'), table('EUR', '2026-07-10', '1')];

  it('uses the cached ECB day for the date, else the latest earlier one', () => {
    expect(cachedRates(cache, 'PLN', '2026-07-09')?.rates.EUR).toBe('4.25');
    expect(cachedRates(cache, 'PLN', '2026-07-12')?.rates.EUR).toBe('4.31');
  });

  it('falls back to the last cached rates for an older date', () => {
    expect(cachedRates(cache, 'PLN', '2026-01-01')?.rates.EUR).toBe('4.31');
  });

  it('is undefined with nothing cached for the base currency', () => {
    expect(cachedRates(cache, 'USD', '2026-07-10')).toBeUndefined();
  });
});

describe('parseRateCache', () => {
  it('reads a stored cache and drops anything malformed', () => {
    const stored = JSON.stringify([table('PLN', '2026-07-10', '4.31'), { base: 'PLN', rates: 'nope' }]);
    expect(parseRateCache(stored)).toEqual([table('PLN', '2026-07-10', '4.31')]);
    expect(parseRateCache('not json')).toEqual([]);
    expect(parseRateCache(null)).toEqual([]);
  });
});
