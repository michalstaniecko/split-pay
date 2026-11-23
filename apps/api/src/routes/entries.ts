import { zValidator } from '@hono/zod-validator';
import {
  type Entry,
  entryFromEdit,
  entryFromNew,
  EntryUpdate,
  EntryVersionCheck,
  type Group,
  Id,
  type Member,
  NewEntry,
  validateEntryInGroup,
} from '@split-pay/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import type { Db } from '../db/client';
import { entries, groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { memberIdOfUser, recordChange } from './change-log';
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
  const entry = toEntryDto(created);
  await recordChange(tx, {
    kind: 'entry.create',
    groupId: entry.groupId,
    targetId: entry.id,
    actorMemberId: context.members.find((m) => m.userId === context.userId)?.id ?? null,
    before: null,
    after: entry,
    now,
  });
  return { status: 'created', entry };
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
    })
    /**
     * Edits an entry (any member, ADR-0008): the body is the whole entry as
     * entered plus the version it was based on. 200 the new version; 409
     * `version_conflict` with the current entry when that version is stale or
     * the entry is deleted; 400 invalid (another id); 404. An archived group
     * answers 409 `archived` (`rejectWritesToArchived`).
     */
    .put('/:entryId', zValidator('json', EntryUpdate), async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const { baseVersion, entry } = c.req.valid('json');
      const result = await db.transaction(async (tx) => {
        const groupMembers = await tx.select().from(members).where(eq(members.groupId, group.id));
        return editEntry(tx, c.req.param('entryId'), entry, baseVersion, {
          group: toSharedGroup(group),
          members: groupMembers,
          actorMemberId: groupMembers.find((m) => m.userId === userId)?.id ?? null,
        });
      });
      return entryChangeResponse(c, result);
    })
    /**
     * Soft-deletes an entry (`deletedAt`), based on `?baseVersion=`. 200 the
     * deleted entry (also when it already was deleted — idempotent); 409
     * `version_conflict` with the current entry; 409 `archived` in an archived
     * group (`rejectWritesToArchived`); 404.
     */
    .delete('/:entryId', zValidator('query', EntryVersionCheck), async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const result = await db.transaction(async (tx) =>
        setEntryDeleted(tx, toSharedGroup(group), c.req.param('entryId'), {
          deleted: true,
          baseVersion: c.req.valid('query').baseVersion,
          actorMemberId: await memberIdOfUser(tx, group.id, userId),
        }),
      );
      return entryChangeResponse(c, result);
    })
    /**
     * Restores a deleted entry ("Cofnij"), based on the version it had when
     * deleted. Responses as for delete (a live entry → 200 idempotent).
     */
    .post('/:entryId/restore', zValidator('json', EntryVersionCheck), async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const result = await db.transaction(async (tx) =>
        setEntryDeleted(tx, toSharedGroup(group), c.req.param('entryId'), {
          deleted: false,
          baseVersion: c.req.valid('json').baseVersion,
          actorMemberId: await memberIdOfUser(tx, group.id, userId),
        }),
      );
      return entryChangeResponse(c, result);
    });

export type ChangeEntryResult =
  | { status: 'changed'; entry: Entry }
  | { status: 'conflict'; current: Entry }
  | { status: 'not_found' }
  | { status: 'invalid'; issues: string[] };

function entryChangeResponse(c: Context<AuthEnv>, result: ChangeEntryResult) {
  switch (result.status) {
    case 'changed':
      return c.json(result.entry, 200);
    case 'conflict':
      return c.json({ error: 'version_conflict' as const, entry: result.current }, 409);
    case 'not_found':
      return c.json({ error: 'not_found' as const }, 404);
    case 'invalid':
      return c.json({ error: 'invalid_entry' as const, issues: result.issues }, 400);
  }
}

/** The entry with this id in this group (deleted ones included). */
async function findEntry(tx: Tx, groupId: Id, entryId: string | undefined): Promise<EntryRow | undefined> {
  if (!Id.safeParse(entryId).success) return undefined;
  const [row] = await tx
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId!), eq(entries.groupId, groupId)));
  return row;
}

/**
 * Applies an edit with optimistic concurrency (ADR-0005): the stored entry is
 * replaced only while its version is still `baseVersion` and it is not
 * deleted (`UPDATE … WHERE version = $base AND deleted_at IS NULL`), so a
 * concurrent edit can't be overwritten. Bumps `version`, `updatedAt` and the
 * group's `lastActivityAt`, and records an `entry.edit` in the change history
 * (#20; `undoesChangeId` when it is an undo). Reuse for any content change
 * (history undo #20, outbox replay #22).
 */
export async function editEntry(
  tx: Tx,
  entryId: string | undefined,
  input: NewEntry,
  baseVersion: number,
  context: {
    group: Group;
    members: readonly Member[];
    /** Who edits (change history). */
    actorMemberId: Id | null;
    undoesChangeId?: Id;
    now?: Date;
  },
): Promise<ChangeEntryResult> {
  const now = context.now ?? new Date();
  const row = await findEntry(tx, context.group.id, entryId);
  if (!row) return { status: 'not_found' };
  const current = toEntryDto(row);
  if (current.version !== baseVersion || current.deletedAt !== null) return { status: 'conflict', current };

  const parsed = entryFromEdit(current, input, iso(now));
  if (!parsed.success) {
    return { status: 'invalid', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  const issues = validateEntryInGroup(parsed.data, context.group, context.members);
  if (issues.length > 0) return { status: 'invalid', issues };

  // Every kind-specific column is rewritten, so a changed kind leaves no stale values behind.
  const { id: _id, groupId: _groupId, createdBy: _by, createdAt: _at, ...changes } = toEntryRow(parsed.data);
  const [updated] = await tx
    .update(entries)
    .set({
      title: null,
      category: null,
      split: null,
      payers: null,
      recipients: null,
      fromMemberId: null,
      toMemberId: null,
      receiptPhotoId: null,
      ...changes,
    })
    .where(and(eq(entries.id, current.id), eq(entries.version, baseVersion), isNull(entries.deletedAt)))
    .returning();
  // Lost a race with another change: report what is stored now.
  if (!updated) return editEntry(tx, entryId, input, baseVersion, context);
  await tx.update(groups).set({ lastActivityAt: now }).where(eq(groups.id, context.group.id));
  const entry = toEntryDto(updated);
  await recordChange(tx, {
    kind: 'entry.edit',
    groupId: entry.groupId,
    targetId: entry.id,
    actorMemberId: context.actorMemberId,
    undoesChangeId: context.undoesChangeId ?? null,
    before: current,
    after: entry,
    now,
  });
  return { status: 'changed', entry };
}

/**
 * Soft-deletes (`deleted: true`) or restores an entry, based on the version
 * the client saw. Doesn't bump `version` (the content is unchanged — see
 * `EntryUpdate` in shared), only `updatedAt`; doesn't move the group in the
 * inbox. Records `entry.delete` / `entry.restore` in the change history.
 * Already in the requested state → `changed` with the stored entry
 * (idempotent retry, nothing recorded). Archived group → invalid.
 */
export async function setEntryDeleted(
  tx: Tx,
  group: Group,
  entryId: string | undefined,
  options: {
    deleted: boolean;
    baseVersion: number;
    /** Who deletes/restores (change history). */
    actorMemberId: Id | null;
    undoesChangeId?: Id;
    now?: Date;
  },
): Promise<ChangeEntryResult> {
  const now = options.now ?? new Date();
  const row = await findEntry(tx, group.id, entryId);
  if (!row) return { status: 'not_found' };
  const current = toEntryDto(row);
  if ((current.deletedAt !== null) === options.deleted) return { status: 'changed', entry: current };
  if (current.version !== options.baseVersion) return { status: 'conflict', current };
  if (group.archivedAt !== null) return { status: 'invalid', issues: ['Group is archived'] };

  const [updated] = await tx
    .update(entries)
    .set({ deletedAt: options.deleted ? now : null, updatedAt: now })
    .where(
      and(
        eq(entries.id, current.id),
        eq(entries.version, options.baseVersion),
        options.deleted ? isNull(entries.deletedAt) : isNotNull(entries.deletedAt),
      ),
    )
    .returning();
  if (!updated) return setEntryDeleted(tx, group, entryId, options);
  const entry = toEntryDto(updated);
  await recordChange(tx, {
    kind: options.deleted ? 'entry.delete' : 'entry.restore',
    groupId: group.id,
    targetId: entry.id,
    actorMemberId: options.actorMemberId,
    undoesChangeId: options.undoesChangeId ?? null,
    before: current,
    after: entry,
    now,
  });
  return { status: 'changed', entry };
}
