import { randomUUID } from 'node:crypto';
import type { Change, ChangeData, Id } from '@split-pay/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { changes, members } from '../db/schema';

/** A database handle or an open transaction. */
export type Tx = Pick<Db, 'select' | 'insert' | 'update'>;

type ChangeRow = typeof changes.$inferSelect;

export type NewChange = ChangeData & {
  groupId: Id;
  targetId: Id;
  actorMemberId: Id | null;
  /** Defaults to a fresh UUID; a claim's change reuses the claim id. */
  id?: Id;
  /** Set when this change undoes another one. */
  undoesChangeId?: Id | null;
  now?: Date;
};

/**
 * Records a change in the group's change history (#20). Call it inside the
 * transaction that makes the change, right after the write succeeded, so the
 * history never misses or invents a change. No-op retries must not record.
 */
export async function recordChange(tx: Tx, change: NewChange): Promise<Change> {
  const [row] = await tx
    .insert(changes)
    .values({
      id: change.id ?? randomUUID(),
      groupId: change.groupId,
      kind: change.kind,
      targetId: change.targetId,
      actorMemberId: change.actorMemberId,
      before: change.before,
      after: change.after,
      undoesChangeId: change.undoesChangeId ?? null,
      ...(change.now ? { createdAt: change.now } : {}),
    })
    .returning();
  if (!row) throw new Error('change was not recorded');
  return toChangeDto(row, null);
}

/** The member a user is in a group (the actor of their changes), if any. */
export async function memberIdOfUser(tx: Tx, groupId: Id, userId: Id): Promise<Id | null> {
  const [row] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.userId, userId)));
  return row?.id ?? null;
}

/** A stored change as the shared `Change`. */
export const toChangeDto = (row: ChangeRow, undoneByChangeId: Id | null): Change =>
  ({
    id: row.id,
    groupId: row.groupId,
    kind: row.kind,
    targetId: row.targetId,
    actorMemberId: row.actorMemberId,
    before: row.before ?? null,
    after: row.after ?? null,
    createdAt: row.createdAt.toISOString(),
    undoesChangeId: row.undoesChangeId,
    undoneByChangeId,
  }) as Change;
