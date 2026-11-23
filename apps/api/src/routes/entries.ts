import { zValidator } from '@hono/zod-validator';
import {
  type Entry,
  entryFromNew,
  type Group,
  type Id,
  type Member,
  NewEntry,
  validateEntryInGroup,
} from '@split-pay/shared';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { entries, groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { findMyGroup, toSharedGroup } from './group-access';

type EntryRow = typeof entries.$inferSelect;
type EntryInsert = typeof entries.$inferInsert;
/** A database handle or an open transaction. */
type Tx = Pick<Db, 'select' | 'insert' | 'update'>;

const iso = (d: Date) => d.toISOString();

/** A stored row as the shared `Entry` (the API's entry DTO). */
export function toEntryDto(row: EntryRow): Entry {
  const meta = {
    id: row.id,
    groupId: row.groupId,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
    date: row.date,
    amount: row.amount,
    currency: row.currency,
    rateToBase: row.rateToBase,
  };
  if (row.kind === 'settlement') {
    return { kind: 'settlement', ...meta, from: row.fromMemberId!, to: row.toMemberId! };
  }
  const fields = {
    ...meta,
    title: row.title!,
    category: row.category!,
    split: row.split!,
    receiptPhotoId: row.receiptPhotoId,
  };
  return row.kind === 'expense'
    ? { kind: 'expense', ...fields, payers: row.payers! }
    : { kind: 'income', ...fields, recipients: row.recipients! };
}

/** The row storing an entry (inverse of `toEntryDto`). */
export function toEntryRow(entry: Entry): EntryInsert {
  const base = {
    id: entry.id,
    groupId: entry.groupId,
    kind: entry.kind,
    version: entry.version,
    createdBy: entry.createdBy,
    date: entry.date,
    amount: entry.amount,
    currency: entry.currency,
    rateToBase: entry.rateToBase,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
    deletedAt: entry.deletedAt ? new Date(entry.deletedAt) : null,
  };
  if (entry.kind === 'settlement') return { ...base, fromMemberId: entry.from, toMemberId: entry.to };
  return {
    ...base,
    title: entry.title,
    category: entry.category,
    split: entry.split,
    receiptPhotoId: entry.receiptPhotoId,
    ...(entry.kind === 'expense' ? { payers: entry.payers } : { recipients: entry.recipients }),
  };
}

export type CreateEntryResult =
  | { status: 'created' | 'existing'; entry: Entry }
  | { status: 'conflict' }
  | { status: 'invalid'; issues: string[] };

/**
 * Creates an entry in a group (inside the caller's transaction, if any):
 * completes it with `entryFromNew`, validates it with `Entry` and
 * `validateEntryInGroup`, inserts it and bumps the group's `lastActivityAt`
 * (inbox order). Idempotent on the client-generated id: the same id in the
 * same group returns the stored entry; an id used in another group is a conflict.
 */
export async function createEntry(
  tx: Tx,
  input: NewEntry,
  context: { group: Group; members: readonly Member[]; userId: Id; now?: Date },
): Promise<CreateEntryResult> {
  const now = context.now ?? new Date();
  const parsed = entryFromNew(input, { groupId: context.group.id, createdBy: context.userId, now: iso(now) });
  if (!parsed.success) {
    return { status: 'invalid', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }

  const [existing] = await tx.select().from(entries).where(eq(entries.id, input.id));
  if (existing) {
    return existing.groupId === context.group.id
      ? { status: 'existing', entry: toEntryDto(existing) }
      : { status: 'conflict' };
  }

  const issues = validateEntryInGroup(parsed.data, context.group, context.members);
  if (issues.length > 0) return { status: 'invalid', issues };

  const [created] = await tx.insert(entries).values(toEntryRow(parsed.data)).onConflictDoNothing().returning();
  // Lost a race with the same id: report it like a repeated create.
  if (!created) return createEntry(tx, input, context);
  await tx.update(groups).set({ lastActivityAt: now }).where(eq(groups.id, context.group.id));
  return { status: 'created', entry: toEntryDto(created) };
}

/** The most recently added live entry of each group — the inbox preview. */
export async function latestEntries(db: Db, groupIds: readonly Id[]) {
  if (groupIds.length === 0) return new Map<Id, EntryPreview>();
  const rows = await db
    .selectDistinctOn([entries.groupId], {
      groupId: entries.groupId,
      id: entries.id,
      kind: entries.kind,
      title: entries.title,
      amount: entries.amount,
      currency: entries.currency,
      createdAt: entries.createdAt,
    })
    .from(entries)
    .where(and(inArray(entries.groupId, [...groupIds]), isNull(entries.deletedAt)))
    .orderBy(entries.groupId, desc(entries.createdAt), desc(entries.id));
  return new Map(
    rows.map((r): [Id, EntryPreview] => [
      r.groupId,
      { id: r.id, kind: r.kind, title: r.title, amount: r.amount, currency: r.currency, createdAt: iso(r.createdAt) },
    ]),
  );
}

export interface EntryPreview {
  id: Id;
  kind: Entry['kind'];
  /** `null` for a settlement. */
  title: string | null;
  amount: number;
  currency: string;
  createdAt: string;
}

/**
 * Entries of one group, mounted at `/groups/:groupId/entries` inside the
 * groups sub-app (which already requires a signed-in user). Every route is
 * scoped by membership: 404 for a group the caller is not in.
 */
export const entriesRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>()
    /** The group's live entries in Conversation order: entry date, then creation time. */
    .get('/', async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const rows = await db
        .select()
        .from(entries)
        .where(and(eq(entries.groupId, group.id), isNull(entries.deletedAt)))
        .orderBy(asc(entries.date), asc(entries.createdAt), asc(entries.id));
      return c.json(rows.map(toEntryDto), 200);
    })
    /**
     * Creates an entry: 201 created, 200 the same id already in this group
     * (retry), 409 the id is used elsewhere, 400 invalid (`Entry` rules or
     * members/currency of the group).
     */
    .post('/', zValidator('json', NewEntry), async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const result = await db.transaction(async (tx) => {
        const groupMembers = await tx.select().from(members).where(eq(members.groupId, group.id));
        return createEntry(tx, c.req.valid('json'), { group: toSharedGroup(group), members: groupMembers, userId });
      });
      switch (result.status) {
        case 'created':
          return c.json(result.entry, 201);
        case 'existing':
          return c.json(result.entry, 200);
        case 'conflict':
          return c.json({ error: 'conflict' as const }, 409);
        case 'invalid':
          return c.json({ error: 'invalid_entry' as const, issues: result.issues }, 400);
      }
    });
