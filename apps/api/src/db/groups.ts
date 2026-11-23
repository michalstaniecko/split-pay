import type { Attendance } from '@split-pay/shared';
import { sql } from 'drizzle-orm';
import { boolean, date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/** Group (GLOSSARY): the only container for entries and members. Ids are client-generated (ADR-0005). */
export const groups = pgTable(
  'groups',
  {
    id: uuid().primaryKey(),
    name: text().notNull(),
    emoji: text().notNull(),
    color: text().notNull(),
    baseCurrency: text().notNull(),
    /** Both or neither (shared `Group` schema) — a group with dates is a trip. */
    startDate: date({ mode: 'string' }),
    endDate: date({ mode: 'string' }),
    simplifyDebts: boolean().notNull().default(true),
    archivedAt: timestamp({ withTimezone: true }),
    /**
     * The member who created the group (Owner). No FK: the group and its owner
     * member are inserted in one transaction and reference each other.
     */
    ownerMemberId: uuid().notNull(),
    /** Inbox order: group creation, then bumped by every entry created/edited (#8+). */
    lastActivityAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [index('groups_last_activity_at_idx').on(t.lastActivityAt)],
);

/** Member (GLOSSARY): a person in a group, with (`userId`) or without an account. */
export const members = pgTable(
  'members',
  {
    id: uuid().primaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    displayName: text().notNull(),
    /** `null` = member without account. */
    userId: uuid().references(() => user.id, { onDelete: 'set null' }),
    /** `null` = present for the whole trip (ADR-0018). */
    attendance: jsonb().$type<Attendance>(),
    ...timestamps,
  },
  (t) => [
    // Delta sync per group (ADR-0005).
    index('members_group_id_updated_at_idx').on(t.groupId, t.updatedAt),
    index('members_user_id_idx').on(t.userId),
    // A user is at most one member of a group.
    uniqueIndex('members_group_id_user_id_key')
      .on(t.groupId, t.userId)
      .where(sql`${t.userId} is not null`),
  ],
);
