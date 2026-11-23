import { type Change, isUndoable } from '@split-pay/shared';
import { DetailedError } from 'hono/client';

/** Whether a history row offers "Cofnij": an undoable change not undone yet, in a group that isn't archived. */
export const canUndo = (change: Change, group: { archivedAt: string | null }): boolean =>
  group.archivedAt === null && isUndoable(change);

/** Undoing the claim of my own member takes the group away from me (leave the screen afterwards). */
export const undoLosesAccess = (change: Change, myMemberId: string | null): boolean =>
  change.kind === 'claim' && myMemberId !== null && change.targetId === myMemberId;

export type UndoFailure = 'changedSince' | 'forbidden' | 'notUndoable' | 'invalid' | 'unknown';

/**
 * Why an undo failed: `changedSince` — the entry/member/setting changed after
 * this change (409; undo respects versioning), `forbidden` — renaming someone
 * else's account, `notUndoable`, `invalid` (e.g. archived group: 409
 * `archived`), else unknown.
 */
export function undoFailure(error: unknown): UndoFailure {
  if (!(error instanceof DetailedError)) return 'unknown';
  const data = (error.detail as { data?: unknown } | undefined)?.data as { error?: unknown } | undefined;
  if (data?.error === 'archived') return 'invalid';
  if (error.statusCode === 409) return 'changedSince';
  if (error.statusCode === 403) return 'forbidden';
  if (data?.error === 'not_undoable') return 'notUndoable';
  if (error.statusCode === 400) return 'invalid';
  return 'unknown';
}
