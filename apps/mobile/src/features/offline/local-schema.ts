import type { Entry, Member, NewEntry } from '@split-pay/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/*
 * The device's offline copy (ADR-0005): a cache of my groups, their members
 * and entries, plus the outbox of changes not yet accepted by the server.
 *
 * Rows mirror the server's DTOs: each keeps the DTO as JSON (`data`) — what
 * the screens read, so new API fields need no local migration — and copies
 * out only the columns local queries filter and sort on.
 * The DDL lives in `local-migrations.ts`; `local-store.test.ts` checks both agree.
 */

/** A group as cached from the API (`GET /groups` / delta sync) or a local group (ADR-0021), without members. */
export interface CachedGroup {
  id: string;
  name: string;
  emoji: string;
  color: string;
  baseCurrency: string;
  startDate: string | null;
  endDate: string | null;
  simplifyDebts: boolean;
  archivedAt: string | null;
  ownerMemberId: string;
  createdAt: string;
  lastActivityAt: string;
  /** A local group's device member ("Ja", ADR-0021); never set in a group from the API. */
  deviceMemberId?: string;
  [field: string]: unknown;
}

/** The inbox preview of a group's most recently added entry (API `lastEntry`). */
export interface EntryPreview {
  id: string;
  kind: Entry['kind'];
  title: string | null;
  amount: number;
  currency: string;
  createdAt: string;
}

export const localGroups = sqliteTable('groups', {
  id: text().primaryKey(),
  data: text({ mode: 'json' }).$type<CachedGroup>().notNull(),
  /** The server's inbox preview (`GET /groups`); a newer queued entry of mine overrides it. */
  lastEntry: text({ mode: 'json' }).$type<EntryPreview | null>(),
  /** When someone else last added an entry (`GET /groups`), for the inbox unread marker (#40). */
  lastEntryByOthersAt: text(),
  lastActivityAt: text().notNull(),
  createdAt: text().notNull(),
  /** A local group (ADR-0021): lives only in the device database, never synced. False for groups from the API. */
  local: integer({ mode: 'boolean' }).notNull().default(false),
  /** Delta sync cursor (`GET /groups/:groupId/sync?since=`); null until the first delta sync. */
  cursor: text(),
  /** When the group's members and entries were last pulled; null = only the inbox row is cached. */
  syncedAt: text(),
  /** The group's `lastActivityAt` as of that pull — a newer one in `GET /groups` means new entries to pull. */
  syncedActivityAt: text(),
});

export const localMembers = sqliteTable(
  'members',
  {
    id: text().primaryKey(),
    groupId: text().notNull(),
    /** Server order (member creation). */
    position: integer().notNull(),
    data: text({ mode: 'json' }).$type<Member>().notNull(),
  },
  (t) => [index('members_group_id_idx').on(t.groupId, t.position)],
);

export const localEntries = sqliteTable(
  'entries',
  {
    id: text().primaryKey(),
    groupId: text().notNull(),
    date: text().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
    deletedAt: text(),
    /** For local search (SPEC: inbox search runs on SQLite). Null for settlements. */
    title: text(),
    data: text({ mode: 'json' }).$type<Entry>().notNull(),
  },
  (t) => [index('entries_group_id_date_idx').on(t.groupId, t.date, t.createdAt)],
);

/** What an outbox operation does to its entry (the matching API route). */
export type OutboxChange = 'create' | 'edit' | 'delete' | 'restore';
/**
 * - `queued`: waiting to be sent (🕓 on the bubble);
 * - `failed`: the server refused it for good (red "!" → retry / discard);
 * - `conflict`: the entry changed on the server meanwhile (red "!" → keep my / their version, #23).
 */
export type OutboxStatus = 'queued' | 'failed' | 'conflict';

/**
 * Changes waiting for the server, sent in `seq` order. Unsent and refused
 * operations both stay here — they are the bubble's outbox state.
 */
export const localOutbox = sqliteTable(
  'outbox',
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    groupId: text().notNull(),
    entryId: text().notNull(),
    change: text().$type<OutboxChange>().notNull(),
    /** create/edit: the entry as entered; delete/restore: null. */
    payload: text({ mode: 'json' }).$type<NewEntry>(),
    /** edit/delete/restore: the version the change was based on; create: null. */
    baseVersion: integer(),
    status: text().$type<OutboxStatus>().notNull(),
    /** Why it failed: the API error code (`invalid_entry`, `conflict`, `not_found`, …). */
    error: text(),
    /** `conflict`: the server's current entry. */
    current: text({ mode: 'json' }).$type<Entry>(),
    createdAt: text().notNull(),
  },
  (t) => [index('outbox_entry_id_idx').on(t.entryId)],
);

export const localSchema = { localGroups, localMembers, localEntries, localOutbox };
