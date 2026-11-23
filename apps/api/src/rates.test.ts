import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';
import { testDb } from '../test/db';
import { frankfurterRateSource, type RateDay, type RateSource } from './rates/source';
import { syncRates } from './rates/sync';

/** A rate source with fixed ECB days; records the ranges it was asked for. No network. */
function fakeSource(days: RateDay[]) {
  const calls: { from: string; to: string }[] = [];
  const source: RateSource = {
    async fetchDays(from, to) {
      calls.push({ from, to });
      return days.filter((d) => d.date >= from && d.date <= to);
    },
  };
  return { source, calls };
}

// Thursday and Friday; no ECB rates on the weekend.
const thursday: RateDay = { date: '2026-07-09', perEur: { PLN: '4.2500', USD: '1.0800' } };
const friday: RateDay = { date: '2026-07-10', perEur: { PLN: '4.3157', USD: '1.0812' } };

describe('syncRates (daily rate job)', () => {
  it('backfills a year of rates into an empty table', async () => {
    const { source, calls } = fakeSource([thursday, friday]);
    await syncRates(testDb.db, source, '2026-07-12');
    expect(calls).toEqual([{ from: '2025-07-12', to: '2026-07-12' }]);
  });

  it('then only asks for the days after the latest stored one', async () => {
    const { source, calls } = fakeSource([thursday, friday]);
    await syncRates(testDb.db, source, '2026-07-10');
    await syncRates(testDb.db, source, '2026-07-12');
    expect(calls.at(-1)).toEqual({ from: '2026-07-11', to: '2026-07-12' });
  });

  it('does not ask again once it has today', async () => {
    const { source, calls } = fakeSource([thursday, friday]);
    await syncRates(testDb.db, source, '2026-07-10');
    await syncRates(testDb.db, source, '2026-07-10');
    expect(calls).toHaveLength(1);
  });
});

describe('GET /rates/:date', () => {
  const { app, signIn, client } = createTestApp();

  async function withRates() {
    await syncRates(testDb.db, fakeSource([thursday, friday]).source, '2026-07-12');
    return signIn('ania@example.com');
  }

  it('returns rates to the base currency for that date', async () => {
    const ania = await withRates();
    const table = await parseResponse(
      client(ania).rates[':date'].$get({ param: { date: '2026-07-09' }, query: { base: 'PLN' } }),
    );
    expect(table).toEqual({
      base: 'PLN',
      date: '2026-07-09',
      ratesDate: '2026-07-09',
      rates: { EUR: '4.25', PLN: '1', USD: '3.93519' },
    });
  });

  it('falls back to the latest earlier date (weekend → Friday)', async () => {
    const ania = await withRates();
    const table = await parseResponse(
      client(ania).rates[':date'].$get({ param: { date: '2026-07-12' }, query: { base: 'EUR' } }),
    );
    expect(table.ratesDate).toBe('2026-07-10');
    expect(table.rates.PLN).toBe('0.231712');
  });

  it('404 when there are no rates on or before the date, or none for the base currency', async () => {
    const ania = await withRates();
    const before = await client(ania).rates[':date'].$get({ param: { date: '2026-07-01' }, query: { base: 'PLN' } });
    expect(before.status).toBe(404);
    const unknownBase = await client(ania).rates[':date'].$get({ param: { date: '2026-07-10' }, query: { base: 'XYZ' } });
    expect(unknownBase.status).toBe(404);
  });

  it('400 for an invalid date or currency', async () => {
    const ania = await withRates();
    expect((await app.request('/rates/2026-13-01?base=PLN', { headers: { cookie: ania.cookie } })).status).toBe(400);
    expect((await app.request('/rates/2026-07-10?base=pln', { headers: { cookie: ania.cookie } })).status).toBe(400);
  });

  it('requires a signed-in user', async () => {
    const res = await client().rates[':date'].$get({ param: { date: '2026-07-10' }, query: { base: 'PLN' } });
    expect(res.status).toBe(401);
  });
});

describe('frankfurterRateSource', () => {
  it('reads a Frankfurter time series into ECB days (fetch injected, no network)', async () => {
    const requested: string[] = [];
    const source = frankfurterRateSource({
      baseUrl: 'https://rates.example',
      fetch: async (url) => {
        requested.push(String(url));
        return Response.json({
          amount: 1,
          base: 'EUR',
          start_date: '2026-07-09',
          end_date: '2026-07-10',
          rates: { '2026-07-09': { PLN: 4.25, USD: 1.08 }, '2026-07-10': { PLN: 4.3157, JPY: 162.5 } },
        });
      },
    });
    expect(await source.fetchDays('2026-07-09', '2026-07-12')).toEqual([
      { date: '2026-07-09', perEur: { PLN: '4.25', USD: '1.08' } },
      { date: '2026-07-10', perEur: { PLN: '4.3157', JPY: '162.5' } },
    ]);
    expect(requested).toEqual(['https://rates.example/v1/2026-07-09..2026-07-12']);
  });

  it('fails on an error response', async () => {
    const source = frankfurterRateSource({
      baseUrl: 'https://rates.example',
      fetch: async () => new Response('nope', { status: 503 }),
    });
    await expect(source.fetchDays('2026-07-09', '2026-07-10')).rejects.toThrow(/503/);
  });
});
