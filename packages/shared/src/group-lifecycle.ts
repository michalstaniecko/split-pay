import type { MinorAmount } from './money';

/**
 * Whether `userId` may permanently delete the group — the owner's only extra
 * permission (ADR-0008). Ownership follows the owner *member*: whoever holds
 * it (including someone who claimed it) is the owner. When the owner member
 * has no account — the owner deleted their account (ADR-0010) or left the
 * group — nobody holds the permission, so it falls to every member;
 * otherwise such a group could never be deleted.
 */
export function canDeleteGroup(
  group: { ownerMemberId: string },
  members: readonly { id: string; userId: string | null }[],
  userId: string,
): boolean {
  const me = members.find((m) => m.userId === userId);
  if (!me) return false;
  const owner = members.find((m) => m.id === group.ownerMemberId);
  return me.id === group.ownerMemberId || owner?.userId == null;
}

/** A member may leave a group only when their balance is zero (SPEC "Group and account lifecycle"). */
export const canLeaveGroup = (balance: MinorAmount): boolean => balance === 0;
