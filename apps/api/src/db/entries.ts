import type { Category, EntryKind, MemberAmount, Split } from '@split-pay/shared';
import { sql } from 'drizzle-orm';
import { bigint, check, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { groups } from './groups';

/**
 * Entry (GLOSSARY): expenses, incomes and settlements in one table, `kind`
 * telling them apart (shared `Entry` schema). Rows store what the user
 * entered — the split mode, the amount in the entry currency and the frozen
 * rate; shares and balances are derived by `@split-pay/shared` (ADR-0016).
 * Ids are client-generated; `version`, `createdBy` and the timestamps exist
 * from the start for offline sync and conflicts (ADR-0005).
 *
 * Kind-specific columns are null for the other kinds:
 * - expense: title, category, split, payers, receiptPhotoId
 * - income: title, category, split, recipients, receiptPhotoId
 * - settlement: fromMemberId, toMemberId
 * Member ids inside jsonb are not foreign keys; the API checks them with
 * `validateEntryInGroup`.
 */
export const entries = pgTable(
  'entries',
  {
    id: uuid().primaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    kind: text().$type<EntryKind>().notNull(),
    /** Incremented by every edit; updates are `WHERE version = $expected` (#11). */
    version: integer().notNull().default(1),
    /**
     * The user who added the entry. No FK: deleting an account keeps the
     * group's history (ADR-0010).
     */
    createdBy: uuid().notNull(),
    date: date({ mode: 'string' }).notNull(),
    /** Minor units of `currency` (ADR-0003). */
    amount: bigint({ mode: 'number' }).notNull(),
    currency: text().notNull(),
    /** Frozen rate as a decimal string. */
    rateToBase: text().notNull(),
    title: text(),
    category: text().$type<Category>(),
    split: jsonb().$type<Split>(),
    payers: jsonb().$type<MemberAmount[]>(),
    recipients: jsonb().$type<MemberAmount[]>(),
    fromMemberId: uuid(),
    toMemberId: uuid(),
    receiptPhotoId: uuid(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    /** Soft delete (#11) — deleted entries stay for history and delta sync. */
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // Delta sync per group (ADR-0005).
    index('entries_group_id_updated_at_idx').on(t.groupId, t.updatedAt),
    // The Conversation order.
    index('entries_group_id_date_created_at_idx').on(t.groupId, t.date, t.createdAt),
    check('entries_kind_check', sql`${t.kind} in ('expense', 'income', 'settlement')`),
    check('entries_amount_positive_check', sql`${t.amount} > 0`),
  ],
);
