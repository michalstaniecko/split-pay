import type { Entry, NewEntry } from '@split-pay/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { LocalDb } from './local-db';
import { enqueueCreate, entryRow } from './local-store';
import { localEntries, localOutbox } from './local-schema';
import { discardOutbox, type OutboxOp } from './outbox';

/*
 * Changes of existing entries through the outbox (#23, ADR-0005): offline
 * edits and deletions of my own entries, and resolving a version conflict
 * ("keep my / their version").
 *
 * While an entry has operations in the outbox, its cached row is my version
 * (what the list shows) and keeps the server version it was last read at;
 * the version each new operation is based on follows from the operations
 * already queued (`expectedVersion`).
 */

/** The entry has a refused operation (red "!"): resolve it before changing the entry again. */
export class OutboxBlockedError extends Error {
  constructor() {
    super('outbox_blocked');
  }
}

/** An entry someone else added can't be changed offline (ADR-0005). */
export class LockedOfflineError extends Error {
  constructor() {
    super('locked_offline');
  }
}

/**
 * Whether a change of the entry must go through the outbox: offline, or
 * while earlier changes of it still wait to be sent (they must go first).
 */
export async function mustQueueChange(db: LocalDb, entryId: string, online: boolean): Promise<boolean> {
  if (!online) return true;
  return (await opsOf(db, entryId)).some((op) => op.status === 'queued');
}

/** The entry with `content` entered over it (server-owned fields kept) — the optimistic local copy. */
function withContent(entry: Entry, content: NewEntry, updatedAt: string): Entry {
  return {
    ...content,
    groupId: entry.groupId,
    version: entry.version,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
    updatedAt,
    deletedAt: entry.deletedAt,
  } as Entry;
}

async function opsOf(db: LocalDb, entryId: string): Promise<OutboxOp[]> {
  return db.select().from(localOutbox).where(eq(localOutbox.entryId, entryId)).orderBy(asc(localOutbox.seq));
}

/** The server version the entry will have once the queued operations are accepted (the next one's base). */
function expectedVersion(ops: readonly OutboxOp[], known: number): number {
  let version = known;
  for (const op of ops) {
    if (op.change === 'create') version = 1;
    else if (op.change === 'edit') version = (op.baseVersion ?? version) + 1;
    else version = op.baseVersion ?? version;
  }
  return version;
}

function assertNotBlocked(ops: readonly OutboxOp[]) {
  if (ops.some((op) => op.status !== 'queued')) throw new OutboxBlockedError();
}

const upsertEntry = (db: LocalDb, entry: Entry) => {
  const values = entryRow(entry);
  return db.insert(localEntries).values(values).onConflictDoUpdate({ target: localEntries.id, set: values });
};

/**
 * Edits an entry on this device: the list shows my version at once (🕓) and
 * the edit waits in the outbox. An entry whose create or last edit is still
 * queued has that operation rewritten instead (nothing was sent yet).
 * Returns the local copy.
 */
export async function enqueueEdit(db: LocalDb, base: Entry, input: NewEntry, now: string): Promise<Entry> {
  const ops = await opsOf(db, base.id);
  assertNotBlocked(ops);
  const edited = withContent(base, input, now);
  const last = ops.at(-1);
  const write =
    last && (last.change === 'create' || last.change === 'edit')
      ? db.update(localOutbox).set({ payload: input }).where(eq(localOutbox.seq, last.seq))
      : db.insert(localOutbox).values({
          groupId: base.groupId,
          entryId: base.id,
          change: 'edit',
          payload: input,
          baseVersion: expectedVersion(ops, base.version),
          status: 'queued',
          createdAt: now,
        });
  await db.batch([write, upsertEntry(db, edited)]);
  return edited;
}

/** A change of mine the server refused as a version conflict, with both versions for the resolution sheet. */
export interface ConflictVersions {
  change: OutboxOp['change'];
  /** My entered content (edit), null for a delete / restore. */
  mine: NewEntry | null;
  /** The server's current entry (may be deleted). */
  current: Entry;
}

function conflictOf(ops: readonly OutboxOp[]): (OutboxOp & { current: Entry }) | undefined {
  return ops.find((op): op is OutboxOp & { current: Entry } => op.status === 'conflict' && op.current !== null);
}

/** The entry's unresolved version conflict, or `null`. */
export async function readConflict(db: LocalDb, entryId: string): Promise<ConflictVersions | null> {
  const conflict = conflictOf(await opsOf(db, entryId));
  return conflict ? { change: conflict.change, mine: conflict.payload, current: conflict.current } : null;
}

/**
 * "Keep my version": my refused change — and my later changes of the entry —
 * go back to the queue, rebased on the server's current version (an edit of
 * an entry deleted meanwhile is preceded by a restore; a delete of an entry
 * already deleted is dropped). The list shows my version until they are sent.
 */
export async function keepMine(db: LocalDb, entryId: string): Promise<void> {
  const ops = await opsOf(db, entryId);
  const conflict = conflictOf(ops);
  if (!conflict) return;
  const { current } = conflict;
  const pending = ops.slice(ops.indexOf(conflict));
  let version = current.version;
  let local: Entry = current;
  const queued: (typeof localOutbox.$inferInsert)[] = [];
  const queue = (op: OutboxOp, change: OutboxOp['change'], payload: NewEntry | null) =>
    queued.push({ groupId: op.groupId, entryId, change, payload, baseVersion: version, status: 'queued', createdAt: op.createdAt });

  for (const op of pending) {
    const deleted = local.deletedAt !== null;
    if (op.change === 'edit' && op.payload) {
      if (deleted) {
        queue(op, 'restore', null);
        local = { ...local, deletedAt: null };
      }
      queue(op, 'edit', op.payload);
      local = withContent(local, op.payload, op.createdAt);
      version += 1;
    } else if (op.change === 'delete' && !deleted) {
      queue(op, 'delete', null);
      local = { ...local, deletedAt: op.createdAt };
    } else if (op.change === 'restore' && deleted) {
      queue(op, 'restore', null);
      local = { ...local, deletedAt: null };
    } else if (op.change === 'create' && op.payload) {
      queued.push({ ...op, seq: undefined, status: 'queued', error: null, current: null });
    }
  }
  if (queued.length === 0) {
    // My change is already what the server has (e.g. both deleted it).
    await keepTheirs(db, entryId);
    return;
  }
  await db.batch([
    db.delete(localOutbox).where(inArray(localOutbox.seq, pending.map((op) => op.seq))),
    db.insert(localOutbox).values(queued),
    upsertEntry(db, local),
  ]);
}

/** "Keep their version": my pending changes of the entry are dropped and the server's current version is shown. */
export async function keepTheirs(db: LocalDb, entryId: string): Promise<void> {
  const conflict = conflictOf(await opsOf(db, entryId));
  if (!conflict) return discardOutbox(db, entryId);
  await db.batch([db.delete(localOutbox).where(eq(localOutbox.entryId, entryId)), upsertEntry(db, conflict.current)]);
}

/**
 * Deletes an entry on this device: it leaves the list at once and the delete
 * waits in the outbox. An entry that never reached the server (create still
 * queued) is simply forgotten. Returns the deleted entry — what "Cofnij"
 * (`enqueueRestore`) takes.
 */
export async function enqueueDelete(db: LocalDb, entry: Entry, now: string): Promise<Entry> {
  const ops = await opsOf(db, entry.id);
  assertNotBlocked(ops);
  const deleted: Entry = { ...entry, deletedAt: now, updatedAt: now };
  if (ops.some((op) => op.change === 'create')) {
    await db.batch([
      db.delete(localOutbox).where(eq(localOutbox.entryId, entry.id)),
      db.delete(localEntries).where(eq(localEntries.id, entry.id)),
    ]);
    return deleted;
  }
  await db.batch([
    db.insert(localOutbox).values({
      groupId: entry.groupId,
      entryId: entry.id,
      change: 'delete',
      payload: null,
      baseVersion: expectedVersion(ops, entry.version),
      status: 'queued',
      createdAt: now,
    }),
    upsertEntry(db, deleted),
  ]);
  return deleted;
}

/**
 * "Cofnij" of a delete through the outbox: a delete still queued is just
 * cancelled, a never-sent entry is queued for creation again, otherwise a
 * restore is queued. The entry is listed again at once.
 */
export async function enqueueRestore(db: LocalDb, deleted: Entry, now: string): Promise<Entry> {
  const ops = await opsOf(db, deleted.id);
  assertNotBlocked(ops);
  const restored: Entry = { ...deleted, deletedAt: null, updatedAt: now };
  const [cached] = await db.select({ id: localEntries.id }).from(localEntries).where(eq(localEntries.id, deleted.id));
  if (!cached) {
    // Deleted before it ever reached the server (`enqueueDelete` forgot it).
    await enqueueCreate(db, restored);
    return restored;
  }
  const last = ops.at(-1);
  const write =
    last?.change === 'delete'
      ? db.delete(localOutbox).where(eq(localOutbox.seq, last.seq))
      : db.insert(localOutbox).values({
          groupId: deleted.groupId,
          entryId: deleted.id,
          change: 'restore',
          payload: null,
          baseVersion: expectedVersion(ops, deleted.version),
          status: 'queued',
          createdAt: now,
        });
  await db.batch([write, upsertEntry(db, restored)]);
  return restored;
}
