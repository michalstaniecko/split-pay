import { type Group, Id } from '@split-pay/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { groups, members } from '../db/schema';

type GroupRow = typeof groups.$inferSelect;

/**
 * The group, if the user is one of its members; `undefined` for an unknown
 * group, someone else's group or an id that is not a UUID — routes answer all
 * of these with 404 so a group's existence doesn't leak.
 */
export async function findMyGroup(db: Db, groupId: string | undefined, userId: string): Promise<GroupRow | undefined> {
  if (!Id.safeParse(groupId).success) return undefined;
  const [row] = await db
    .select({ group: groups })
    .from(groups)
    .innerJoin(members, and(eq(members.groupId, groups.id), eq(members.userId, userId)))
    .where(eq(groups.id, groupId!));
  return row?.group;
}

/** A group row as the shared `Group` (for `validateEntryInGroup` and other shared rules). */
export const toSharedGroup = (g: GroupRow): Group => ({
  id: g.id,
  name: g.name,
  emoji: g.emoji,
  color: g.color,
  baseCurrency: g.baseCurrency,
  startDate: g.startDate,
  endDate: g.endDate,
  simplifyDebts: g.simplifyDebts,
  archivedAt: g.archivedAt?.toISOString() ?? null,
});
