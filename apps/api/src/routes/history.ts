import {
  type Change,
  type Entry,
  type Group,
  type GroupSettingsSnapshot,
  Id,
  isUndoable,
  toNewEntry,
} from '@split-pay/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Db } from '../db/client';
import { changes, claims, entries, groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { type Tx, recordChange, toChangeDto } from './change-log';
import { undoClaim } from './claims';
import { type ChangeEntryResult, editEntry, notifyEntryChange, setEntryDeleted, toEntryDto } from './entries';
import { findMyGroup, toSharedGroup } from './group-access';

type ChangeRow = typeof changes.$inferSelect;

/** Postgres unique violation (possibly wrapped by Drizzle). */
const isUniqueViolation = (error: unknown): boolean => {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
};

/** The change undoing `changeId`, if it was undone. */
async function undoOf(db: Tx, changeId: Id): Promise<Change | undefined> {
  const [row] = await db.select().from(changes).where(eq(changes.undoesChangeId, changeId));
  if (!row) return undefined;
  return withUndoneBy(db, [row]).then(([c]) => c);
}

/** Rows as DTOs with `undoneByChangeId` filled in. */
export async function withUndoneBy(db: Tx, rows: readonly ChangeRow[]): Promise<Change[]> {
  const ids = rows.map((r) => r.id);
  const undos =
    ids.length === 0
      ? []
      : await db
          .select({ id: changes.id, undoes: changes.undoesChangeId })
          .from(changes)
          .where(inArray(changes.undoesChangeId, ids));
  const undoneBy = new Map(undos.map((u) => [u.undoes, u.id]));
  return rows.map((r) => toChangeDto(r, undoneBy.get(r.id) ?? null));
}

export type UndoResult =
  /** `entryChange`: the entry change the undo made, to notify about after commit. */
  | { status: 'undone'; entryChange?: ChangeEntryResult }
  | { status: 'version_conflict'; entry: Entry }
  | { status: 'changed_since' }
  | { status: 'forbidden' }
  | { status: 'invalid'; issues: string[] };

/**
 * Undoes a recorded change (inside the caller's transaction) by making the
 * opposite change through the same code paths as a user would — so the undo
 * is recorded with `undoesChangeId` and respects versioning: only while the
 * target is still as the change left it (entry: same version and deleted
 * state), otherwise a conflict.
 */
async function undoChange(
  tx: Tx,
  change: Change,
  context: { group: Group; actorMemberId: Id; actorUserId: Id },
): Promise<UndoResult> {
  const record = { actorMemberId: context.actorMemberId, undoesChangeId: change.id };
  switch (change.kind) {
    case 'entry.create':
    case 'entry.edit':
    case 'entry.delete':
    case 'entry.restore': {
      const [row] = await tx
        .select()
        .from(entries)
        .where(and(eq(entries.id, change.targetId), eq(entries.groupId, context.group.id)));
      if (!row) return { status: 'changed_since' };
      const current = toEntryDto(row);
      const after = change.after;
      if (current.version !== after.version || (current.deletedAt === null) !== (after.deletedAt === null)) {
        return { status: 'version_conflict', entry: current };
      }
      const result =
        change.kind === 'entry.edit'
          ? await editEntry(tx, current.id, toNewEntry(change.before), current.version, {
              group: context.group,
              members: await tx.select().from(members).where(eq(members.groupId, context.group.id)),
              ...record,
            })
          : await setEntryDeleted(tx, context.group, current.id, {
              deleted: change.kind !== 'entry.delete',
              baseVersion: current.version,
              ...record,
            });
      switch (result.status) {
        case 'changed':
          return { status: 'undone', entryChange: result };
        case 'conflict':
          return { status: 'version_conflict', entry: result.current };
        case 'not_found':
          return { status: 'changed_since' };
        case 'invalid':
          return { status: 'invalid', issues: result.issues };
      }
    }
    // A member's name or attendance: only while it still is what the change set.
    case 'member.rename':
    case 'member.attendance': {
      const [member] = await tx
        .select()
        .from(members)
        .where(and(eq(members.id, change.targetId), eq(members.groupId, context.group.id)));
      if (!member) return { status: 'changed_since' };
      if (change.kind === 'member.rename') {
        if (member.displayName !== change.after.displayName) return { status: 'changed_since' };
        // Same rule as renaming: a member with an account is renamed only by themselves.
        if (member.userId !== null && member.userId !== context.actorUserId) return { status: 'forbidden' };
        await tx.update(members).set({ displayName: change.before.displayName }).where(eq(members.id, member.id));
        await recordChange(tx, {
          kind: 'member.rename',
          groupId: context.group.id,
          targetId: member.id,
          before: { displayName: member.displayName },
          after: change.before,
          ...record,
        });
        return { status: 'undone' };
      }
      if (JSON.stringify(member.attendance) !== JSON.stringify(change.after.attendance)) {
        return { status: 'changed_since' };
      }
      await tx.update(members).set({ attendance: change.before.attendance }).where(eq(members.id, member.id));
      await recordChange(tx, {
        kind: 'member.attendance',
        groupId: context.group.id,
        targetId: member.id,
        before: { attendance: member.attendance },
        after: change.before,
        ...record,
      });
      return { status: 'undone' };
    }
    case 'settings.update': {
      const [group] = await tx.select().from(groups).where(eq(groups.id, context.group.id));
      if (!group) return { status: 'changed_since' };
      const keys = Object.keys(change.after) as (keyof GroupSettingsSnapshot)[];
      if (keys.some((k) => group[k] !== change.after[k])) return { status: 'changed_since' };
      const before: GroupSettingsSnapshot = {};
      for (const k of keys) before[k] = group[k];
      await tx.update(groups).set(change.before).where(eq(groups.id, group.id));
      await recordChange(tx, {
        kind: 'settings.update',
        groupId: group.id,
        targetId: group.id,
        before,
        after: change.before,
        ...record,
      });
      return { status: 'undone' };
    }
    case 'claim': {
      const [claim] = await tx
        .select()
        .from(claims)
        .where(and(eq(claims.id, change.after.claimId), eq(claims.groupId, context.group.id)));
      if (!claim) return { status: 'changed_since' };
      await undoClaim(tx, claim, context.actorMemberId);
      return { status: 'undone' };
    }
    default:
      return { status: 'invalid', issues: ['not_undoable'] };
  }
}

const HistoryQuery = z.object({
  /** Only the changes of this entry ("Historia" on a bubble, "edytowano" in the entry detail). */
  entryId: Id.optional(),
});

/**
 * The change history of a group (#20), mounted at `/groups/:groupId/changes`
 * inside the groups sub-app. Any member reads it and undoes changes
 * (ADR-0008); for anyone else the group doesn't exist (404).
 */
export const historyRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>()
    /** The group's changes, newest first (optionally one entry's). */
    .get('/', zValidator('query', HistoryQuery), async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const { entryId } = c.req.valid('query');
      const rows = await db
        .select()
        .from(changes)
        .where(
          and(
            eq(changes.groupId, group.id),
            entryId ? eq(changes.targetId, entryId) : undefined,
            entryId ? inArray(changes.kind, ['entry.create', 'entry.edit', 'entry.delete', 'entry.restore']) : undefined,
          ),
        )
        .orderBy(desc(changes.seq));
      return c.json(await withUndoneBy(db, rows), 200);
    })
    /**
     * Undoes a change: 200 the recorded undo (also when it was undone
     * already — idempotent); 400 `not_undoable` (group creation, added
     * members, undone claims) or `invalid_entry` (archived group); 409
     * `version_conflict` with the current entry, or `changed_since` for a
     * member/setting changed again; 403 renaming someone else's account; 404.
     */
    .post('/:changeId/undo', async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      const changeId = c.req.param('changeId');
      if (!group || !Id.safeParse(changeId).success) return c.json({ error: 'not_found' as const }, 404);
      const [row] = await db
        .select()
        .from(changes)
        .where(and(eq(changes.id, changeId), eq(changes.groupId, group.id)));
      if (!row) return c.json({ error: 'not_found' as const }, 404);

      const done = await undoOf(db, row.id);
      if (done) return c.json(done, 200);
      const change = toChangeDto(row, null);
      if (!isUndoable(change)) return c.json({ error: 'not_undoable' as const }, 400);

      let result: UndoResult;
      try {
        result = await db.transaction(async (tx) => {
          const [me] = await tx
            .select({ id: members.id })
            .from(members)
            .where(and(eq(members.groupId, group.id), eq(members.userId, userId)));
          if (!me) return { status: 'changed_since' as const };
          return undoChange(tx, change, { group: toSharedGroup(group), actorMemberId: me.id, actorUserId: userId });
        });
      } catch (error) {
        // Undone concurrently (unique `undoes_change_id`): answer that undo.
        if (!isUniqueViolation(error)) throw error;
        result = { status: 'undone' };
      }
      switch (result.status) {
        case 'undone': {
          // An undone entry change notifies like the same edit/delete/restore would.
          if (result.entryChange) await notifyEntryChange(db, userId, result.entryChange);
          const undo = await undoOf(db, row.id);
          if (!undo) throw new Error(`undo of ${row.id} was not recorded`);
          return c.json(undo, 200);
        }
        case 'version_conflict':
          return c.json({ error: 'version_conflict' as const, entry: result.entry }, 409);
        case 'changed_since':
          return c.json({ error: 'changed_since' as const }, 409);
        case 'forbidden':
          return c.json({ error: 'forbidden' as const }, 403);
        case 'invalid':
          return c.json({ error: 'invalid_entry' as const, issues: result.issues }, 400);
      }
    });
