import { date, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * ECB reference rates (ADR-0014), fetched from Frankfurter by the daily rate
 * job: units of `currency` per 1 EUR on an ECB working day, as a decimal
 * string (ADR-0003). Rates to a group's base currency are derived from these
 * (`ratesToBase` in `@split-pay/shared`); EUR itself is implicit (1).
 */
export const ecbRates = pgTable(
  'ecb_rates',
  {
    date: date({ mode: 'string' }).notNull(),
    currency: text().notNull(),
    ratePerEur: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.currency] })],
);
