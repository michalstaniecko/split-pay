import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { groups } from './groups';

/**
 * Group link (GLOSSARY, ADR-0009): the secret token behind a group's link. One
 * current token per group; revoking replaces it, so the old token stops working.
 * Created on first use.
 */
export const groupLinks = pgTable('group_links', {
  groupId: uuid()
    .primaryKey()
    .references(() => groups.id, { onDelete: 'cascade' }),
  token: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
