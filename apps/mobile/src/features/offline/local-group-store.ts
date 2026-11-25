import {
  type Entry,
  entryFromEdit,
  entryFromNew,
  equalExpenseDefaults,
  type GroupSettingsUpdate,
  type Member,
  type MemberRename,
  type NewEntry,
  type NewGroup,
  type NewMember,
  NewQuickBill,
  QUICK_BILL_EMOJI,
  type SettleUp,
  settleUp,
  validateEntryInGroup,
} from '@split-pay/shared';
import { and, desc, eq, isNull, max } from 'drizzle-orm';
import type { LocalDb } from './local-db';
import { type CachedGroup, type EntryPreview, localEntries, localGroups, localMembers } from './local-schema';
import {
  byLastActivity,
  type CachedGroupListItem,
  entryRow,
  type Locality,
  previewOf,
  readEntries,
  readGroupDetail,
  readGroupList,
  saveEntry,
} from './local-store';

/*
 * The local group store (ADR-0021): the whole write and read path of local
 * groups over the device database. Writes go straight to the database — no
 * outbox, no sync cursor, no versions — and reads return the shapes the
 * group queries return for synced groups, so screens don't tell them apart.
 */

/** A local group as stored: a cached group whose "me" is its device member. */
export type LocalGroup = CachedGroup & { deviceMemberId: string };
/** A local group's inbox row. */
export type LocalGroupListItem = CachedGroupListItem & LocalGroup & { local: true };
/** A local group with its members, device member first. */
export type LocalGroupDetail = LocalGroup & { local: true; members: Member[] };

/** A person typed in by hand: becomes a member without an account (no user, no attendance). */
export type TypedInMember = Pick<NewMember, 'id' | 'displayName'>;

/**
 * Creating a local group: the group fields (no trip dates in a local group),
 * its device member ("Ja") and the other people typed in by hand. Every id is
 * generated on the client.
 */
export type NewLocalGroup = Pick<NewGroup, 'id' | 'name' | 'emoji' | 'color' | 'baseCurrency'> & {
  simplifyDebts?: boolean;
  deviceMember: TypedInMember;
  people: readonly TypedInMember[];
};

const memberOf = (groupId: string, m: TypedInMember): Member => ({
  id: m.id,
  groupId,
  displayName: m.displayName,
  userId: null,
  attendance: null,
});

/** A new local group as stored, with its members: the device member first, then the people. */
interface CreatedLocalGroup {
  group: LocalGroup;
  members: Member[];
}

/** A new local group created `at` (an ISO timestamp), not yet written. */
function newLocalGroup(input: NewLocalGroup, at: string): CreatedLocalGroup {
  const group: LocalGroup = {
    id: input.id,
    name: input.name,
    emoji: input.emoji,
    color: input.color,
    baseCurrency: input.baseCurrency,
    startDate: null,
    endDate: null,
    simplifyDebts: input.simplifyDebts ?? true,
    archivedAt: null,
    // Nobody else can join, so the device member stands in as the group's creator.
    ownerMemberId: input.deviceMember.id,
    deviceMemberId: input.deviceMember.id,
    createdAt: at,
    lastActivityAt: at,
  };
  const members = [input.deviceMember, ...input.people].map((m) => memberOf(input.id, m));
  return { group, members };
}

/** The writes storing a new local group and its members in order; `lastEntry` is its inbox preview. */
function insertLocalGroup(db: LocalDb, { group, members }: CreatedLocalGroup, lastEntry: EntryPreview | null = null) {
  const at = group.createdAt;
  return [
    db.insert(localGroups).values({ id: group.id, data: group, lastActivityAt: at, createdAt: at, lastEntry, local: true }),
    ...members.map((m, position) => db.insert(localMembers).values({ id: m.id, groupId: m.groupId, position, data: m })),
  ] as const;
}

/** Creates a local group with its device member and the other people, in one write. */
export async function createLocalGroup(db: LocalDb, input: NewLocalGroup, now = new Date()): Promise<void> {
  await db.batch(insertLocalGroup(db, newLocalGroup(input, now.toISOString())));
}

/** A quick bill without an account: the `NewQuickBill` sheet plus the device member ("Ja") who pays. */
export type NewLocalQuickBill = NewQuickBill & { deviceMember: TypedInMember };

/**
 * Creates a quick bill as a local group in one write (GLOSSARY *Quick bill*,
 * ADR-0021): a 🧾 group named after the title, the device member first, then
 * the people, and one expense paid by the device member, split equally among
 * everyone — the same result as POST /quick-bills, on the device only.
 * Nothing is written when the input is invalid.
 */
export async function createLocalQuickBill(
  db: LocalDb,
  input: NewLocalQuickBill,
  now = new Date(),
): Promise<{ group: LocalGroup }> {
  const bill = NewQuickBill.parse(input);
  const at = now.toISOString();
  const deviceMemberId = input.deviceMember.id;
  const created = newLocalGroup(
    {
      id: bill.groupId,
      name: bill.title,
      emoji: QUICK_BILL_EMOJI,
      color: bill.color,
      baseCurrency: bill.currency,
      deviceMember: input.deviceMember,
      people: bill.people,
    },
    at,
  );
  const { group, members } = created;
  const parsed = entryFromNew(
    equalExpenseDefaults({
      id: bill.expenseId,
      title: bill.title,
      amount: bill.amount,
      currency: bill.currency,
      date: bill.date,
      payerMemberId: deviceMemberId,
      members,
    }),
    { groupId: group.id, createdBy: deviceMemberId, createdByMember: deviceMemberId, now: at },
  );
  if (!parsed.success) throw parsed.error;
  const expense = parsed.data;
  const issues = validateEntryInGroup(expense, group, members);
  if (issues.length > 0) throw new Error(issues.join('; '));
  await db.batch([
    ...insertLocalGroup(db, created, previewOf(expense)),
    db.insert(localEntries).values(entryRow(expense)),
  ]);
  return { group };
}

/** Adds a person typed in by hand at the end of the group's member list. */
export async function addLocalMember(db: LocalDb, groupId: string, input: TypedInMember): Promise<void> {
  const [last] = await db
    .select({ position: max(localMembers.position) })
    .from(localMembers)
    .where(eq(localMembers.groupId, groupId));
  const position = (last?.position ?? -1) + 1;
  const m = memberOf(groupId, input);
  await db.insert(localMembers).values({ id: m.id, groupId, position, data: m });
}

/** Renames a member of one local group (the device member too — other groups keep their own). */
export async function renameLocalMember(
  db: LocalDb,
  groupId: string,
  memberId: string,
  { displayName }: MemberRename,
): Promise<void> {
  const where = and(eq(localMembers.groupId, groupId), eq(localMembers.id, memberId));
  const [row] = await db.select({ data: localMembers.data }).from(localMembers).where(where);
  if (!row) throw new Error('Member not found');
  await db.update(localMembers).set({ data: { ...row.data, displayName } }).where(where);
}

/** Changes a local group's settings (Group info → settings); only the given ones change. */
export async function updateLocalGroupSettings(db: LocalDb, groupId: string, update: GroupSettingsUpdate): Promise<void> {
  const where = and(eq(localGroups.id, groupId), eq(localGroups.local, true));
  const [row] = await db.select({ data: localGroups.data }).from(localGroups).where(where);
  if (!row) throw new Error('Group not found');
  await db.update(localGroups).set({ data: { ...row.data, ...update } }).where(where);
}

/**
 * Deletes a local group with its members and entries, at once and for good —
 * there is no owner to ask and no undo (ADR-0021). A synced group is left alone.
 */
export async function deleteLocalGroup(db: LocalDb, groupId: string): Promise<void> {
  const [row] = await db
    .select({ id: localGroups.id })
    .from(localGroups)
    .where(and(eq(localGroups.id, groupId), eq(localGroups.local, true)));
  if (!row) return;
  await db.batch([
    db.delete(localEntries).where(eq(localEntries.groupId, groupId)),
    db.delete(localMembers).where(eq(localMembers.groupId, groupId)),
    db.delete(localGroups).where(eq(localGroups.id, groupId)),
  ]);
}

/** One local group with its members, or `undefined` when there is none with this id. */
export async function readLocalGroup(db: LocalDb, groupId: string): Promise<LocalGroupDetail | undefined> {
  const group = await readGroupDetail(db, groupId);
  if (!group?.local || group.deviceMemberId === undefined) return undefined;
  return { ...group, local: true, deviceMemberId: group.deviceMemberId };
}

/** The local groups for the inbox, most recent activity first. */
export async function readLocalGroupList(db: LocalDb): Promise<LocalGroupListItem[]> {
  return (await readGroupList(db)).filter((g): g is LocalGroupListItem => g.local);
}

/**
 * The inbox (ADR-0021): the signed-in user's groups from their cache (`user`,
 * none when signed out) merged with the local groups on this device
 * (`device`, none on the web), most recent activity first. Local groups keep
 * their `local` flag, so the inbox badges them.
 */
export async function readInbox({
  user,
  device,
}: {
  user: LocalDb | null;
  device: LocalDb | null;
}): Promise<(CachedGroupListItem & Locality)[]> {
  const [synced, local] = await Promise.all([
    user ? readGroupList(user) : [],
    device ? readLocalGroupList(device) : [],
  ]);
  return [...synced, ...local].sort(byLastActivity);
}

/** The local group, or an error when there is none with this id. */
async function requireLocalGroup(db: LocalDb, groupId: string): Promise<LocalGroupDetail> {
  const group = await readLocalGroup(db, groupId);
  if (!group) throw new Error('Local group not found');
  return group;
}

/**
 * Adds an entry to a local group, written straight to the device database (no
 * outbox, no conflicts): version 1, added by the device member. Fails when
 * the input breaks the `Entry` rules. Returns the stored entry.
 */
export async function addLocalEntry(db: LocalDb, groupId: string, input: NewEntry, now = new Date()): Promise<Entry> {
  const group = await requireLocalGroup(db, groupId);
  const parsed = entryFromNew(input, {
    groupId,
    // No account: the device member stands in as the author.
    createdBy: group.deviceMemberId,
    createdByMember: group.deviceMemberId,
    now: now.toISOString(),
  });
  if (!parsed.success) throw parsed.error;
  return storeEntry(db, group, parsed.data, now);
}

/**
 * Edits an entry of a local group: the content from `input` replaces the
 * stored one (version bumped). With a single author there are no conflicts,
 * so any entry may be edited, whatever version `base` is.
 */
export async function editLocalEntry(db: LocalDb, base: Entry, input: NewEntry, now = new Date()): Promise<Entry> {
  const group = await requireLocalGroup(db, base.groupId);
  const parsed = entryFromEdit(base, input, now.toISOString());
  if (!parsed.success) throw parsed.error;
  return storeEntry(db, group, parsed.data, now);
}

/**
 * Deletes an entry of a local group. Soft, like in a synced group, so "Cofnij"
 * (`restoreLocalEntry`) can bring it back. Returns the deleted entry.
 */
export async function deleteLocalEntry(db: LocalDb, entry: Entry, now = new Date()): Promise<Entry> {
  const at = now.toISOString();
  const deleted: Entry = { ...entry, deletedAt: at, updatedAt: at };
  await saveEntry(db, deleted);
  await refreshInboxRow(db, entry.groupId);
  return deleted;
}

/** "Cofnij" after deleting an entry of a local group: it is listed again. Returns the restored entry. */
export async function restoreLocalEntry(db: LocalDb, deleted: Entry, now = new Date()): Promise<Entry> {
  const restored: Entry = { ...deleted, deletedAt: null, updatedAt: now.toISOString() };
  await saveEntry(db, restored);
  await refreshInboxRow(db, deleted.groupId);
  return restored;
}

/**
 * Checks a new or edited entry against its local group (members, base
 * currency) and stores it; the group's activity moves to `now`, like the
 * server's `lastActivityAt` on a create or an edit.
 */
async function storeEntry(db: LocalDb, group: LocalGroupDetail, entry: Entry, now: Date): Promise<Entry> {
  const issues = validateEntryInGroup(entry, group, group.members);
  if (issues.length > 0) throw new Error(issues.join('; '));
  await saveEntry(db, entry);
  await refreshInboxRow(db, group.id, now);
  return entry;
}

/**
 * Keeps the group's inbox row in step with its entries: the preview is the
 * most recently added live entry (the server's rule) and, when given,
 * `activityAt` becomes the group's last activity.
 */
async function refreshInboxRow(db: LocalDb, groupId: string, activityAt?: Date): Promise<void> {
  const [latest] = await db
    .select({ data: localEntries.data })
    .from(localEntries)
    .where(and(eq(localEntries.groupId, groupId), isNull(localEntries.deletedAt)))
    .orderBy(desc(localEntries.createdAt), desc(localEntries.id))
    .limit(1);
  const lastEntry = latest ? previewOf(latest.data) : null;
  if (!activityAt) {
    await db.update(localGroups).set({ lastEntry }).where(eq(localGroups.id, groupId));
    return;
  }
  const [row] = await db.select({ data: localGroups.data }).from(localGroups).where(eq(localGroups.id, groupId));
  if (!row) return;
  const at = activityAt.toISOString();
  await db
    .update(localGroups)
    .set({ lastEntry, lastActivityAt: at, data: { ...row.data, lastActivityAt: at } })
    .where(eq(localGroups.id, groupId));
}

/** A local group's balances and suggested transfers (the balances endpoint's shape), or `undefined` when there is no such group. */
export async function readLocalBalances(
  db: LocalDb,
  groupId: string,
): Promise<(SettleUp & { baseCurrency: string; simplifyDebts: boolean }) | undefined> {
  const group = await readLocalGroup(db, groupId);
  if (!group) return undefined;
  const { balances, transfers } = settleUp(
    await readEntries(db, groupId),
    group,
    group.members.map((m) => m.id),
  );
  return { baseCurrency: group.baseCurrency, simplifyDebts: group.simplifyDebts, balances, transfers };
}
