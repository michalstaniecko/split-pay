import { zValidator } from '@hono/zod-validator';
import { CurrencyCode, LocalDate, type RateTable, ratesToBase } from '@split-pay/shared';
import { eq, lte, max } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { ecbRates } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';

/**
 * Exchange rates for the full expense form (ADR-0014), from the ECB rates the
 * daily job stored. Signed-in users only.
 */
export const ratesRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) =>
  new Hono<AuthEnv>().use(requireUser).get(
    /**
     * Rates to `base` for an entry date: the ECB day itself or, on weekends,
     * holidays and before publication, the latest earlier one (`ratesDate`).
     * 404 when no ECB day is that old or the ECB has no rate for `base`.
     */
    '/:date',
    zValidator('param', z.object({ date: LocalDate })),
    zValidator('query', z.object({ base: CurrencyCode })),
    async (c) => {
      const { date } = c.req.valid('param');
      const { base } = c.req.valid('query');
      const [day] = await db
        .select({ date: max(ecbRates.date) })
        .from(ecbRates)
        .where(lte(ecbRates.date, date));
      const ratesDate = day?.date;
      if (!ratesDate) return c.json({ error: 'not_found' as const }, 404);

      const rows = await db.select().from(ecbRates).where(eq(ecbRates.date, ratesDate));
      const rates = ratesToBase(Object.fromEntries(rows.map((r) => [r.currency, r.ratePerEur])), base);
      if (!rates) return c.json({ error: 'not_found' as const }, 404);
      return c.json({ base, date, ratesDate, rates } satisfies RateTable, 200);
    },
  );
