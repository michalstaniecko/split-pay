import { canNudge, type Member } from '@split-pay/shared';
import type { TransferRow } from '../balances/balances';

/** What the API puts into a push (`apps/api/src/push/sender.ts` `PushData`). */
export interface PushData {
  /** `notification`: visible, tap opens the Conversation; `sync`: silent, refresh the group. */
  type: 'notification' | 'sync';
  groupId: string;
  /** The entry to scroll to and highlight. */
  entryId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * A push's data, from a notification (`request.content.data`) or a background
 * task payload (`{ dataString }`); `null` when it isn't one of ours.
 */
export function parsePushData(raw: unknown): PushData | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.dataString === 'string') {
    try {
      return parsePushData(JSON.parse(raw.dataString));
    } catch {
      return null;
    }
  }
  if ((raw.type !== 'notification' && raw.type !== 'sync') || typeof raw.groupId !== 'string') return null;
  return {
    type: raw.type,
    groupId: raw.groupId,
    ...(typeof raw.entryId === 'string' ? { entryId: raw.entryId } : {}),
  };
}

/** Where tapping a notification leads: the group's Conversation, scrolled to the entry's bubble. */
export function notificationHref(data: PushData) {
  return {
    pathname: '/groups/[groupId]' as const,
    params: { groupId: data.groupId, ...(data.entryId ? { entryId: data.entryId } : {}) },
  };
}

/** Index of an entry's bubble among the Conversation items, `null` when it isn't (yet) there. */
export function entryItemIndex(
  items: readonly ({ type: 'entry'; entry: { id: string } } | { type: string })[],
  entryId: string,
): number | null {
  const index = items.findIndex((item) => item.type === 'entry' && 'entry' in item && item.entry.id === entryId);
  return index === -1 ? null : index;
}

/** A recent nudge as the API lists it (GET /groups/:groupId/nudges). */
export interface RecentNudge {
  memberId: string;
  nudgedAt: string;
  nextNudgeAt: string;
}

/**
 * "Przypomnij" on a transfer in the balance drawer (SPEC): only on a transfer
 * owed to me, by a member with an account (others get no push), not in an
 * archived group. After a nudge — by anyone — it stays disabled with
 * "przypomniano dziś" for 24 h.
 */
export function nudgeButton(
  transfer: Pick<TransferRow, 'from' | 'direction'>,
  ctx: {
    archived: boolean;
    members: readonly Pick<Member, 'id' | 'userId'>[];
    nudges: readonly RecentNudge[];
    now: string;
  },
): 'hidden' | 'available' | 'remindedToday' {
  if (ctx.archived || transfer.direction !== 'toMe') return 'hidden';
  if (!ctx.members.find((m) => m.id === transfer.from)?.userId) return 'hidden';
  const last = ctx.nudges.find((n) => n.memberId === transfer.from);
  return canNudge(last?.nudgedAt ?? null, ctx.now) ? 'available' : 'remindedToday';
}
