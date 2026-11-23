import { type LocalDate, nextDay } from '@split-pay/shared';
import { max } from 'drizzle-orm';
import type { Db } from '../db/client';
import { ecbRates } from '../db/schema';
import type { RateSource } from './source';

/** How far back an empty rates table is filled, so backdated entries find a rate. */
const BACKFILL_DAYS = 365;

function minusDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The UTC calendar date of `now`. */
export const utcToday = (now: Date = new Date()): LocalDate => now.toISOString().slice(0, 10);

/**
 * Fetches the ECB days missing since the latest stored one up to `today`
 * (a year back when the table is empty) and stores them. Days already
 * stored are left as they are. Returns how many days the source returned.
 */
export async function syncRates(db: Db, source: RateSource, today: LocalDate): Promise<number> {
  const [latest] = await db.select({ date: max(ecbRates.date) }).from(ecbRates);
  const from = latest?.date ? nextDay(latest.date) : minusDays(today, BACKFILL_DAYS);
  if (from > today) return 0;

  const days = await source.fetchDays(from, today);
  const rows = days.flatMap((day) =>
    Object.entries(day.perEur).map(([currency, ratePerEur]) => ({ date: day.date, currency, ratePerEur })),
  );
  // Insert in chunks: a year of ECB days is ~8000 rows.
  for (let i = 0; i < rows.length; i += 1000) {
    await db.insert(ecbRates).values(rows.slice(i, i + 1000)).onConflictDoNothing();
  }
  return days.length;
}

/**
 * The daily rate job: syncs on start and then every `intervalMs`. Only
 * missing days are fetched, so checking a few times a day still downloads
 * each ECB day once — and picks up the day's rates soon after the ECB
 * publishes them (~16:00 CET). Returns a function stopping the job.
 */
export function startRateJob(options: {
  db: Db;
  source: RateSource;
  intervalMs?: number;
  log?: (message: string, error?: unknown) => void;
}): () => void {
  const { db, source, intervalMs = 6 * 60 * 60 * 1000, log = console.log } = options;
  const run = async () => {
    try {
      const days = await syncRates(db, source, utcToday());
      if (days > 0) log(`[rates] stored ${days} ECB day(s)`);
    } catch (error) {
      log('[rates] sync failed', error);
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
