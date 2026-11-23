import { Entry, type NewEntry } from '@split-pay/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DetailedError } from 'hono/client';
import type { LocalDb } from './local-db';
import { type Batch, entryRow } from './local-store';
import { localEntries, localOutbox, type OutboxChange, type OutboxStatus } from './local-schema';

/** One outbox row. */
export type OutboxOp = typeof localOutbox.$inferSelect;

/** What happened to one sent operation. */
export type SendOutcome =
  /** Accepted; `entry` is the server's copy. */
  | { type: 'sent'; entry: Entry }
  /** Can't be decided now (offline, server error, session expired): stop and resend later, in order. */
  | { type: 'retry_later' }
  /** Refused for good (`error` = API error code): red "!" until retried or discarded. */
  | { type: 'failed'; error: string }
  /** The entry changed on the server meanwhile (409 `version_conflict`): the user decides (#23). */
  | { type: 'conflict'; current: Entry };

/** An entry's outbox state as the bubble shows it (🕓 queued, red "!" failed/conflict). */
export interface OutboxEntryState {
  change: OutboxChange;
  status: OutboxStatus;
  error: string | null;
  current: Entry | null;
}

/**
 * Maps a failed request to a `SendOutcome`. Anything that isn't a definite
 * answer about the operation itself is retried later: network errors, 401
 * (the session layer signs out; the outbox survives for the next sign-in),
 * 408, 429 and 5xx.
 */
export function classifySendError(error: unknown): Exclude<SendOutcome, { type: 'sent' }> {
  if (!(error instanceof DetailedError) || typeof error.statusCode !== 'number') return { type: 'retry_later' };
  const status = error.statusCode;
  if (status === 401 || status === 408 || status === 429 || status >= 500) return { type: 'retry_later' };
  const data = (error.detail as { data?: unknown } | undefined)?.data as { error?: unknown; entry?: unknown } | undefined;
  if (status === 409 && data?.error === 'version_conflict') {
    const current = Entry.safeParse(data.entry);
    if (current.success) return { type: 'conflict', current: current.data };
  }
  return { type: 'failed', error: typeof data?.error === 'string' ? data.error : `http_${status}` };
}

/**
 * Sends queued operations oldest first, one at a time (ADR-0005: send the
 * outbox, then pull). Accepted → the server's copy replaces the local entry
 * and the operation leaves the outbox. `retry_later` stops the run so the
 * order is kept. A refused operation stays (failed/conflict) and blocks later
 * operations on the same entry, not the others.
 * Returns how many were accepted, whether the run stopped early, and the groups whose cache changed.
 */
export async function flushOutbox(
  db: LocalDb,
  send: (op: OutboxOp) => Promise<SendOutcome>,
): Promise<{ sent: number; stopped: boolean; groupIds: string[] }> {
  const ops = await db.select().from(localOutbox).orderBy(asc(localOutbox.seq));
  const blocked = new Set(ops.filter((op) => op.status !== 'queued').map((op) => op.entryId));
  const groupIds = new Set<string>();
  let sent = 0;

  for (const op of ops) {
    if (op.status !== 'queued' || blocked.has(op.entryId)) continue;
    const outcome = await send(op);
    switch (outcome.type) {
      case 'retry_later':
        return { sent, stopped: true, groupIds: [...groupIds] };
      case 'sent': {
        const values = entryRow(outcome.entry);
        await db.batch([
          db.delete(localOutbox).where(eq(localOutbox.seq, op.seq)),
          db.insert(localEntries).values(values).onConflictDoUpdate({ target: localEntries.id, set: values }),
        ]);
        sent += 1;
        groupIds.add(op.groupId);
        break;
      }
      case 'failed':
        await db.update(localOutbox).set({ status: 'failed', error: outcome.error }).where(eq(localOutbox.seq, op.seq));
        blocked.add(op.entryId);
        groupIds.add(op.groupId);
        break;
      case 'conflict':
        await db
          .update(localOutbox)
          .set({ status: 'conflict', error: 'version_conflict', current: outcome.current })
          .where(eq(localOutbox.seq, op.seq));
        blocked.add(op.entryId);
        groupIds.add(op.groupId);
        break;
    }
  }
  return { sent, stopped: false, groupIds: [...groupIds] };
}

/** Per entry of the group, the state of its oldest outbox operation (absent = synced, no mark). */
export async function readOutboxState(db: LocalDb, groupId: string): Promise<Map<string, OutboxEntryState>> {
  const ops = await db.select().from(localOutbox).where(eq(localOutbox.groupId, groupId)).orderBy(asc(localOutbox.seq));
  const states = new Map<string, OutboxEntryState>();
  for (const op of ops) {
    if (states.has(op.entryId)) continue;
    states.set(op.entryId, { change: op.change, status: op.status, error: op.error, current: op.current ?? null });
  }
  return states;
}

/** The red "!" sheet's "Spróbuj ponownie": the entry's refused operations go back to the queue. */
export async function retryOutbox(db: LocalDb, entryId: string): Promise<void> {
  await db
    .update(localOutbox)
    .set({ status: 'queued', error: null, current: null })
    .where(and(eq(localOutbox.entryId, entryId), inArray(localOutbox.status, ['failed', 'conflict'])));
}

/**
 * Drops the entry's outbox operations. An entry that was only ever created
 * here (unsent create) leaves the device with them; for others the cached
 * server copy stays ("keep their version" — reload it with a delta sync).
 */
export async function discardOutbox(db: LocalDb, entryId: string): Promise<void> {
  const ops = await db.select().from(localOutbox).where(eq(localOutbox.entryId, entryId));
  const localOnly = ops.some((op) => op.change === 'create');
  await db.batch([
    db.delete(localOutbox).where(eq(localOutbox.entryId, entryId)),
    ...(localOnly ? [db.delete(localEntries).where(eq(localEntries.id, entryId))] : []),
  ] as Batch);
}

/**
 * Records a change the server refused as a version conflict while online
 * (#11 edit / delete / restore) — the bubble shows a red "!" until resolved
 * (#23: "keep my / their version"). Replaces an older mark of the same entry.
 */
export async function markConflict(
  db: LocalDb,
  conflict: {
    groupId: string;
    entryId: string;
    change: Exclude<OutboxChange, 'create'>;
    baseVersion: number;
    payload: NewEntry | null;
    current: Entry;
  },
): Promise<void> {
  await db.batch([
    db.delete(localOutbox).where(and(eq(localOutbox.entryId, conflict.entryId), eq(localOutbox.status, 'conflict'))),
    db.insert(localOutbox).values({
      ...conflict,
      status: 'conflict',
      error: 'version_conflict',
      createdAt: new Date().toISOString(),
    }),
  ]);
}

/** Clears the conflict mark of an entry once a later change of it was accepted. */
export async function clearConflict(db: LocalDb, entryId: string): Promise<void> {
  await db.delete(localOutbox).where(and(eq(localOutbox.entryId, entryId), eq(localOutbox.status, 'conflict')));
}
