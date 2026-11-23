import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * Payout details (GLOSSARY) of a user — one row per user, created on first
 * save. Normalized by the shared `PayoutDetails` schema (no separators).
 * Deleted with the account (ADR-0010: personal data is removed).
 */
export const payoutDetails = pgTable('payout_details', {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  bankAccount: text(),
  blikPhone: text(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
