import { type Entry, type Member, toNewEntry } from '@split-pay/shared';
import { and, asc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { LocalDb } from './local-db';
import { type CachedGroup, type EntryPreview, localEntries, localGroups, localMembers, localOutbox } from './local-schema';

/**
 * An inbox row as cached (API `GET /groups` item): the group, its last-entry
 * preview and when someone else last added an entry (unread marker, #40).
 */
export type CachedGroupListItem = CachedGroup & { lastEntry: EntryPreview | null; lastEntryByOthersAt: string | null };
/** A group with its members (API `GET /groups/:groupId`). */
export type CachedGroupDetail = CachedGroup & { members: Member[] };
/** Whether a group is a local group (ADR-0021) — added on reading; false for everything from the API. */
export type Locality = { local: boolean };
/** One delta sync response (API `GET /groups/:groupId/sync`). */
export interface GroupDelta {
  group: CachedGroupDetail;
  entries: Entry[];
  cursor: string | null;
}

/** A non-empty `db.batch` argument. */
export type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

const previewOf = (e: Entry): EntryPreview => ({
  id: e.id,
  kind: e.kind,
  title: e.kind === 'settlement' ? null : e.title,
  amount: e.amount,
  currency: e.currency,
  createdAt: e.createdAt,
});

/** An entry as its cache row. */
export const entryRow = (e: Entry) => ({
  id: e.id,
  groupId: e.groupId,
  date: e.date,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
  deletedAt: e.deletedAt,
  title: e.kind === 'settlement' ? null : e.title,
  data: e,
});

const groupRow = ({
  members: _members,
  lastEntry: _lastEntry,
  lastEntryByOthersAt: _lastEntryByOthersAt,
  local: _local,
  ...data
}: CachedGroup & { members?: unknown; lastEntry?: unknown; lastEntryByOthersAt?: unknown; local?: unknown }) => ({
  id: data.id,
  data: data as CachedGroup,
  lastActivityAt: data.lastActivityAt,
  createdAt: data.createdAt,
});

/** Removes every trace of these groups (left, deleted, or no longer mine). */
function dropGroups(db: LocalDb, groupIds: string[]): BatchItem<'sqlite'>[] {
  return [
    db.delete(localOutbox).where(inArray(localOutbox.groupId, groupIds)),
    db.delete(localEntries).where(inArray(localEntries.groupId, groupIds)),
    db.delete(localMembers).where(inArray(localMembers.groupId, groupIds)),
    db.delete(localGroups).where(inArray(localGroups.id, groupIds)),
  ];
}

/**
 * Caches `GET /groups`: upserts every listed group (with the server's
 * preview) and forgets groups that are no longer listed.
 */
export async function saveGroupList(db: LocalDb, items: readonly CachedGroupListItem[]): Promise<void> {
  const ids = items.map((g) => g.id);
  const gone = await db
    .select({ id: localGroups.id })
    .from(localGroups)
    .where(ids.length > 0 ? notInArray(localGroups.id, ids) : undefined);
  const batch: BatchItem<'sqlite'>[] = gone.length > 0 ? dropGroups(db, gone.map((g) => g.id)) : [];
  for (const item of items) {
    const row = { ...groupRow(item), lastEntry: item.lastEntry, lastEntryByOthersAt: item.lastEntryByOthersAt };
    batch.push(db.insert(localGroups).values(row).onConflictDoUpdate({ target: localGroups.id, set: row }));
  }
  if (batch.length > 0) await db.batch(batch as Batch);
}

/** Forgets one group (delta sync answered 404: I left it or it was deleted). */
export async function removeGroup(db: LocalDb, groupId: string): Promise<void> {
  await db.batch(dropGroups(db, [groupId]) as Batch);
}

/** The cursor to continue this group's delta sync from (`null` = sync from scratch). */
export async function readSyncCursor(db: LocalDb, groupId: string): Promise<string | null> {
  const [row] = await db.select({ cursor: localGroups.cursor }).from(localGroups).where(eq(localGroups.id, groupId));
  return row?.cursor ?? null;
}

/**
 * Applies one delta sync: the group and its whole member list are replaced,
 * changed entries upserted (soft-deleted ones stay as rows — they just leave
 * the lists). Entries with an operation still in the outbox keep their local
 * copy: the outbox is sent before pulling, so whatever remains there wins
 * until the server accepts or the user resolves it (#23).
 */
export async function applyGroupDelta(db: LocalDb, delta: GroupDelta, now = new Date()): Promise<void> {
  const { group, entries, cursor } = delta;
  const pending = new Set(
    entries.length === 0
      ? []
      : (
          await db
            .selectDistinct({ entryId: localOutbox.entryId })
            .from(localOutbox)
            .where(inArray(localOutbox.entryId, entries.map((e) => e.id)))
        ).map((r) => r.entryId),
  );
  const row = { ...groupRow(group), cursor, syncedAt: now.toISOString(), syncedActivityAt: group.lastActivityAt };
  const batch: BatchItem<'sqlite'>[] = [
    db.insert(localGroups).values(row).onConflictDoUpdate({ target: localGroups.id, set: row }),
    db.delete(localMembers).where(eq(localMembers.groupId, group.id)),
  ];
  group.members.forEach((m, position) => {
    batch.push(db.insert(localMembers).values({ id: m.id, groupId: group.id, position, data: m }).onConflictDoUpdate({
      target: localMembers.id,
      set: { groupId: group.id, position, data: m },
    }));
  });
  for (const e of entries) {
    if (pending.has(e.id)) continue;
    const values = entryRow(e);
    batch.push(db.insert(localEntries).values(values).onConflictDoUpdate({ target: localEntries.id, set: values }));
  }
  await db.batch(batch as Batch);
}

/**
 * The inbox from the cache, most recent activity first, with the server's
 * preview. An entry of mine still in the outbox counts as newer activity and
 * becomes the preview, so an entry added offline shows in the inbox at once.
 */
export async function readGroupList(db: LocalDb): Promise<(CachedGroupListItem & Locality)[]> {
  const groups = await db.select().from(localGroups);
  const queued = await db
    .select({ groupId: localEntries.groupId, data: localEntries.data })
    .from(localEntries)
    .innerJoin(
      localOutbox,
      and(eq(localOutbox.entryId, localEntries.id), eq(localOutbox.change, 'create')),
    )
    .where(isNull(localEntries.deletedAt))
    .orderBy(asc(localEntries.createdAt));
  // Ordered oldest first: the last one written per group is its newest.
  const newestQueued = new Map(queued.map((r) => [r.groupId, r.data]));

  return groups
    .map((g): CachedGroupListItem & Locality => {
      const mine = newestQueued.get(g.id);
      // My queued entries never mark a group unread: `lastEntryByOthersAt` stays the server's.
      const row = { ...g.data, local: g.local, lastEntryByOthersAt: g.lastEntryByOthersAt ?? null };
      if (!mine || mine.createdAt <= g.lastActivityAt) return { ...row, lastActivityAt: g.lastActivityAt, lastEntry: g.lastEntry ?? null };
      return { ...row, lastActivityAt: mine.createdAt, lastEntry: previewOf(mine) };
    })
    .sort(byLastActivity);
}

/** Inbox order: most recent activity first, then newest group, then id (stable across devices). */
export const byLastActivity = (
  a: Pick<CachedGroup, 'id' | 'createdAt' | 'lastActivityAt'>,
  b: Pick<CachedGroup, 'id' | 'createdAt' | 'lastActivityAt'>,
): number =>
  b.lastActivityAt.localeCompare(a.lastActivityAt) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);

/**
 * Of the groups in `GET /groups`, those whose entries should be pulled for
 * offline reading: not cached, never pulled, or active since the last pull
 * (`lastActivityAt` moves on every new or edited entry). Deletions and member
 * changes elsewhere don't move it — they arrive when the Conversation opens.
 */
export async function groupsNeedingSync(db: LocalDb, listed: readonly CachedGroup[]): Promise<string[]> {
  const rows = await db.select({ id: localGroups.id, at: localGroups.syncedActivityAt }).from(localGroups);
  const pulledAt = new Map(rows.map((r) => [r.id, r.at]));
  return listed.filter((g) => (pulledAt.get(g.id) ?? null) !== g.lastActivityAt).map((g) => g.id);
}

/** Stores the server's copy of one entry (accepted change). */
export async function saveEntry(db: LocalDb, entry: Entry): Promise<void> {
  const values = entryRow(entry);
  await db.insert(localEntries).values(values).onConflictDoUpdate({ target: localEntries.id, set: values });
}

/** One cached group with its members, or `undefined` when it isn't cached (yet). */
export async function readGroupDetail(db: LocalDb, groupId: string): Promise<(CachedGroupDetail & Locality) | undefined> {
  const [group] = await db
    .select({ data: localGroups.data, local: localGroups.local })
    .from(localGroups)
    .where(eq(localGroups.id, groupId));
  if (!group) return undefined;
  const members = await db
    .select({ data: localMembers.data })
    .from(localMembers)
    .where(eq(localMembers.groupId, groupId))
    .orderBy(asc(localMembers.position));
  return { ...group.data, local: group.local, members: members.map((m) => m.data) };
}

/** Whether the group's members and entries were pulled at least once. */
export async function isGroupSynced(db: LocalDb, groupId: string): Promise<boolean> {
  const [row] = await db.select({ syncedAt: localGroups.syncedAt }).from(localGroups).where(eq(localGroups.id, groupId));
  return row?.syncedAt != null;
}

/** The group's live entries in Conversation order (entry date, then creation time), queued ones included. */
export async function readEntries(db: LocalDb, groupId: string): Promise<Entry[]> {
  const rows = await db
    .select({ data: localEntries.data })
    .from(localEntries)
    .where(and(eq(localEntries.groupId, groupId), isNull(localEntries.deletedAt)))
    .orderBy(asc(localEntries.date), asc(localEntries.createdAt), asc(localEntries.id));
  return rows.map((r) => r.data);
}

/**
 * Adds an entry on this device: it is listed at once (🕓) and its create
 * waits in the outbox. `entry` is complete as the server would store it
 * (`entryFromNew`); its client-generated id makes resending idempotent.
 */
export async function enqueueCreate(db: LocalDb, entry: Entry): Promise<void> {
  await db.batch([
    db.insert(localEntries).values(entryRow(entry)).onConflictDoNothing(),
    db.insert(localOutbox).values({
      groupId: entry.groupId,
      entryId: entry.id,
      change: 'create',
      payload: toNewEntry(entry),
      baseVersion: null,
      status: 'queued',
      createdAt: entry.createdAt,
    }),
  ]);
}
