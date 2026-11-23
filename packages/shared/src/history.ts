import type { Attendance, Entry, Id } from './model';

/**
 * Change history (GLOSSARY, ADR-0008): every change in a group — entries,
 * members, settings, claims — is recorded with who made it, when, and the
 * state before/after. Any member can undo an undoable change; the undo is
 * itself a recorded change (`undoesChangeId`) of the ordinary kind it
 * performs (undoing a delete is an `entry.restore`).
 *
 * `targetId` is what the change is about: the entry, the member, the group
 * (`group.create`, `settings.update`) or, for claims, the claimed member.
 * Snapshots hold no personal data beyond member names (entries reference
 * member ids), so the history survives renames and account deletion.
 */
export type ChangeData =
  | { kind: 'group.create'; before: null; after: { name: string; emoji: string } }
  /** The group became read-only / writable again (#25); undone with the opposite action, not from the history. */
  | { kind: 'group.archive'; before: null; after: null }
  | { kind: 'group.unarchive'; before: null; after: null }
  /** An entry was added; `after` = the new entry. */
  | { kind: 'entry.create'; before: null; after: Entry }
  /** Content edit (version + 1). */
  | { kind: 'entry.edit'; before: Entry; after: Entry }
  /** Soft delete; `after` has `deletedAt`. */
  | { kind: 'entry.delete'; before: Entry; after: Entry }
  /** Restore of a deleted entry ("Cofnij" or undo from the history). */
  | { kind: 'entry.restore'; before: Entry; after: Entry }
  /** A member without an account was added. */
  | { kind: 'member.add'; before: null; after: { displayName: string } }
  /** A user joined through a group link as a new member. */
  | { kind: 'member.join'; before: null; after: { displayName: string } }
  /** A user left the group (#25): their member stays, without an account. */
  | { kind: 'member.leave'; before: null; after: null }
  | { kind: 'member.rename'; before: { displayName: string }; after: { displayName: string } }
  | { kind: 'member.attendance'; before: { attendance: Attendance | null }; after: { attendance: Attendance | null } }
  /** Only the settings that changed, before and after. */
  | { kind: 'settings.update'; before: GroupSettingsSnapshot; after: GroupSettingsSnapshot }
  /** A user claimed a member without an account (ADR-0007); the change id = the claim id. */
  | { kind: 'claim'; before: null; after: { claimId: Id } }
  /** A claim was undone — the member is without an account again. */
  | { kind: 'claim.undo'; before: { claimId: Id }; after: null };

/** Group settings as recorded by `settings.update` (a subset of the group's columns). */
export interface GroupSettingsSnapshot {
  simplifyDebts?: boolean;
}

export type ChangeKind = ChangeData['kind'];

/** A recorded change as the API returns it (newest first in `GET /groups/:groupId/changes`). */
export type Change = ChangeData & {
  id: Id;
  groupId: Id;
  targetId: Id;
  /** The member who made the change; `null` if unknown. */
  actorMemberId: Id | null;
  createdAt: string;
  /** Set when this change is the undo of another one. */
  undoesChangeId: Id | null;
  /** Set once this change was undone (the id of the undoing change). */
  undoneByChangeId: Id | null;
};

/** The change kinds that can be undone from the history. */
export const UNDOABLE_CHANGE_KINDS: readonly ChangeKind[] = [
  'entry.create',
  'entry.edit',
  'entry.delete',
  'entry.restore',
  'member.rename',
  'member.attendance',
  'settings.update',
  'claim',
];

/** Whether the change can (still) be undone: an undoable kind not undone yet. */
export const isUndoable = (change: Pick<Change, 'kind' | 'undoneByChangeId'>): boolean =>
  change.undoneByChangeId === null && UNDOABLE_CHANGE_KINDS.includes(change.kind);

/** The entered fields of an entry, in the order a history row lists them. */
export const ENTRY_FIELDS = [
  'kind',
  'title',
  'amount',
  'currency',
  'rateToBase',
  'date',
  'category',
  'payers',
  'recipients',
  'split',
  'from',
  'to',
  'receiptPhotoId',
] as const;
export type EntryField = (typeof ENTRY_FIELDS)[number];

const field = (entry: Entry, key: EntryField): unknown => (entry as Record<string, unknown>)[key];

/**
 * The entered fields that differ between two versions of an entry (an
 * edit's "before → after"). Server-owned fields — version, timestamps,
 * deletion — are ignored; lists and splits are compared by value.
 */
export function changedEntryFields(before: Entry, after: Entry): EntryField[] {
  return ENTRY_FIELDS.filter((key) => JSON.stringify(field(before, key)) !== JSON.stringify(field(after, key)));
}
