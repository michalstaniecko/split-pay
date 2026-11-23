import { canLeaveGroup } from '@split-pay/shared';

/**
 * Inbox sections (SPEC "Navigation and screens"): active groups by last
 * activity, archived ones in the collapsed "Zarchiwizowane" section at the
 * bottom — both keep the API's order.
 */
export function inboxSections<G extends { archivedAt: string | null }>(groups: readonly G[]) {
  return {
    active: groups.filter((g) => g.archivedAt === null),
    archived: groups.filter((g) => g.archivedAt !== null),
  };
}

/**
 * Whether I may leave the group: only with a zero balance (the API enforces
 * it too). `balance` is mine, `null` while balances are loading or I'm not a member.
 */
export function leaveState(
  data: { balances: readonly { memberId: string; amount: number }[] } | undefined,
  myMemberId: string | null,
): { canLeave: boolean; balance: number | null } {
  const balance = data?.balances.find((b) => b.memberId === myMemberId)?.amount ?? null;
  return { canLeave: balance !== null && canLeaveGroup(balance), balance };
}

export type BubbleAction = 'edit' | 'delete' | 'history' | 'copyAmount';

/**
 * A bubble's long-press menu (SPEC "Conversation"): Edytuj, Usuń, Historia,
 * Kopiuj kwotę — in an archived group (read-only) only Historia and Kopiuj kwotę.
 */
export const bubbleActions = ({ archived }: { archived: boolean }): BubbleAction[] =>
  archived ? ['history', 'copyAmount'] : ['edit', 'delete', 'history', 'copyAmount'];
