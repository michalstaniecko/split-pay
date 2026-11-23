import type { CurrencyCode, LocalDate, RateTable } from '@split-pay/shared';
import { queryOptions } from '@tanstack/react-query';
import { DetailedError, parseResponse } from 'hono/client';
import { api } from '@/lib/api';
import { deviceStorage } from '@/lib/device-storage';
import { cachedRates, parseRateCache, rememberRates } from './rate-cache';

const KEY = 'rates';

export interface RatesResult {
  /** `null`: no ECB rates for that date (the user types the rate). */
  table: RateTable | null;
  /** `device`: the API was unreachable and the rates come from the device's cache. */
  from: 'server' | 'device';
}

/**
 * ECB rates to `base` for an entry date (GET /rates/:date?base=). Every
 * fetched table is remembered on the device; without a connection the last
 * cached rates are used (SPEC "Currencies": offline, the phone's last known rate).
 */
export const ratesQuery = (base: CurrencyCode, date: LocalDate) =>
  queryOptions({
    queryKey: ['rates', base, date],
    queryFn: async (): Promise<RatesResult> => {
      try {
        const table = await parseResponse(api.rates[':date'].$get({ param: { date }, query: { base } }));
        deviceStorage.setItem(KEY, JSON.stringify(rememberRates(parseRateCache(deviceStorage.getItem(KEY)), table)));
        return { table, from: 'server' };
      } catch (error) {
        if (error instanceof DetailedError) {
          // The API answered: no rates that old (404), or a real error (401 signs out).
          if (error.statusCode === 404) return { table: null, from: 'server' };
          throw error;
        }
        // No answer (offline, server down): the device's cache.
        const cached = cachedRates(parseRateCache(deviceStorage.getItem(KEY)), base, date);
        if (cached) return { table: cached, from: 'device' };
        throw error;
      }
    },
    // ECB rates of a past day never change.
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
