import { canRenameMember, type Member, MemberRename } from '@split-pay/shared';

export type ParsedMemberName = { ok: true; displayName: string } | { ok: false };

/** Validates a member name typed in the add/rename form with the shared schema the API uses. */
export function parseMemberName(name: string): ParsedMemberName {
  const result = MemberRename.safeParse({ displayName: name });
  return result.success ? { ok: true, displayName: result.data.displayName } : { ok: false };
}

/** A row of the Group info members section. */
export interface MemberRow {
  id: string;
  displayName: string;
  isOwner: boolean;
  isMe: boolean;
  /** Member without account (GLOSSARY). */
  withoutAccount: boolean;
  canRename: boolean;
}

/**
 * Members as Group info lists them. `myUserId` is the signed-in user
 * (undefined while the session loads — then only members without an account
 * are renamable).
 */
export function memberRows(
  group: { ownerMemberId: string; members: readonly Member[] },
  myUserId: string | undefined,
): MemberRow[] {
  return group.members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    isOwner: member.id === group.ownerMemberId,
    isMe: myUserId !== undefined && member.userId === myUserId,
    withoutAccount: member.userId === null,
    canRename: myUserId === undefined ? member.userId === null : canRenameMember(member, myUserId),
  }));
}
