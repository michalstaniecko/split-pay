import { z } from 'zod';
import { Entry, NewEntry } from './model';

/**
 * Editing an entry (#11, ADR-0005, ADR-0008). An edit replaces everything the
 * user entered and is based on the version the client saw: the server applies
 * it only if that is still the current version, otherwise it answers with a
 * conflict and the current entry instead of overwriting it.
 *
 * Versioning: `version` counts *content* revisions — every edit bumps it.
 * Deleting and restoring (soft delete, `deletedAt`) also check the base
 * version but don't bump it; they bump `updatedAt` (what delta sync follows).
 * So `version > 1` means "edytowano".
 */
export const EntryUpdate = z.object({
  /** The version the edit was based on. */
  baseVersion: z.number().int().min(1),
  /** The whole entry as entered; its `id` must be the edited entry's. */
  entry: NewEntry,
});
export type EntryUpdate = z.infer<typeof EntryUpdate>;

/** Delete or restore of an entry, based on the version the client saw. */
export const EntryVersionCheck = z.object({
  baseVersion: z.coerce.number().int().min(1),
});
export type EntryVersionCheck = z.infer<typeof EntryVersionCheck>;

/**
 * The next version of `current` after an edit: the entered fields from
 * `input`, the version bumped, `updatedAt = now`; group, author and creation
 * time stay. Validated with the `Entry` rules (an id other than the current
 * one fails). Check the result against the group with `validateEntryInGroup`.
 */
export function entryFromEdit(current: Entry, input: NewEntry, now: string): z.ZodSafeParseResult<Entry> {
  if (input.id !== current.id) {
    return Entry.safeParse({ ...input, id: null });
  }
  return Entry.safeParse({
    ...input,
    groupId: current.groupId,
    version: current.version + 1,
    createdBy: current.createdBy,
    createdByMember: current.createdByMember,
    createdAt: current.createdAt,
    updatedAt: now,
    deletedAt: current.deletedAt,
  });
}

/** The entered fields of an entry (what an edit sends): `Entry` minus the server-owned fields. */
export function toNewEntry(entry: Entry): NewEntry {
  const {
    groupId: _g,
    version: _v,
    createdBy: _c,
    createdByMember: _cm,
    createdAt: _ca,
    updatedAt: _u,
    deletedAt: _d,
    ...rest
  } = entry;
  return rest;
}

/** The entry's content was changed after it was added — the bubble's "edytowano". */
export const isEdited = (entry: Pick<Entry, 'version'>): boolean => entry.version > 1;
