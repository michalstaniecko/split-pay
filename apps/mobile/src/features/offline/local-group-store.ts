import type { Entry, Member, MemberRename, NewGroup, NewMember } from '@split-pay/shared';
import { and, eq, max } from 'drizzle-orm';
import type { LocalDb } from './local-db';
import { type CachedGroup, localGroups, localMembers } from './local-schema';
import { type Batch, type CachedGroupDetail, type CachedGroupListItem, readEntries, readGroupDetail, readGroupList } from './local-store';

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

/**
 * Creating a local group: the group fields (no trip dates in a local group),
 * its device member ("Ja") and the other people typed in by hand. Every id is
 * generated on the client.
 */
export type NewLocalGroup = Pick<NewGroup, 'id' | 'name' | 'emoji' | 'color' | 'baseCurrency'> & {
  simplifyDebts?: boolean;
  deviceMember: Pick<NewMember, 'id' | 'displayName'>;
  people: readonly Pick<NewMember, 'id' | 'displayName'>[];
};

const memberOf = (groupId: string, m: Pick<NewMember, 'id' | 'displayName'>): Member => ({
  id: m.id,
  groupId,
  displayName: m.displayName,
  userId: null,
  attendance: null,
});

/** Creates a local group with its device member and the other people, in one write. */
export async function createLocalGroup(db: LocalDb, input: NewLocalGroup, now = new Date()): Promise<void> {
  const at = now.toISOString();
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
  await db.batch([
    db.insert(localGroups).values({ id: group.id, data: group, lastActivityAt: at, createdAt: at, local: true }),
    ...members.map((m, position) => db.insert(localMembers).values({ id: m.id, groupId: m.groupId, position, data: m })),
  ] as Batch);
}

/** Adds a person typed in by hand at the end of the group's member list. */
export async function addLocalMember(
  db: LocalDb,
  groupId: string,
  input: Pick<NewMember, 'id' | 'displayName'>,
): Promise<void> {
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

/** One local group with its members, or `undefined` when there is none with this id. */
export async function readLocalGroup(db: LocalDb, groupId: string): Promise<LocalGroupDetail | undefined> {
  const group = await readGroupDetail(db, groupId);
  if (!group?.local) return undefined;
  return group as CachedGroupDetail & LocalGroupDetail;
}

/** The local groups for the inbox, most recent activity first. */
export async function readLocalGroupList(db: LocalDb): Promise<LocalGroupListItem[]> {
  return (await readGroupList(db)).filter((g): g is LocalGroupListItem => g.local);
}

/** A local group's live entries in Conversation order. */
export function readLocalEntries(db: LocalDb, groupId: string): Promise<Entry[]> {
  return readEntries(db, groupId);
}
