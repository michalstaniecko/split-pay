import { randomUUID } from 'node:crypto';
import { type Entry, type Id, type NotificationEvent, notificationRecipients } from '@split-pay/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { groupNotificationSettings, members, notificationSettings, pushQueue } from '../db/schema';

type QueueInsert = typeof pushQueue.$inferInsert;

export interface NotifyInput {
  groupId: Id;
  actorUserId: Id;
  event: NotificationEvent;
  /** The author's name; defaults to their member's name in the group (`null` = removed, ADR-0019). */
  actorName?: string | null;
  /** Debt amount for a nudge (minor units of `currency`). */
  amount?: number;
  currency?: string;
  /** Claimed member's name. */
  memberName?: string;
}

/** Users (among `userIds`) who turned notifications off globally or for this group. */
async function mutedUsers(db: Db, groupId: Id, userIds: Id[]): Promise<Set<Id>> {
  if (userIds.length === 0) return new Set();
  const [global, perGroup] = await Promise.all([
    db
      .select({ userId: notificationSettings.userId })
      .from(notificationSettings)
      .where(and(inArray(notificationSettings.userId, userIds), eq(notificationSettings.enabled, false))),
    db
      .select({ userId: groupNotificationSettings.userId })
      .from(groupNotificationSettings)
      .where(
        and(
          eq(groupNotificationSettings.groupId, groupId),
          inArray(groupNotificationSettings.userId, userIds),
          eq(groupNotificationSettings.enabled, false),
        ),
      ),
  ]);
  return new Set([...global, ...perGroup].map((r) => r.userId));
}

function entrySnapshot(entry: Entry): Pick<QueueInsert, 'entryId' | 'entryKind' | 'entryTitle' | 'amount' | 'currency'> {
  return {
    entryId: entry.id,
    entryKind: entry.kind,
    entryTitle: entry.kind === 'settlement' ? null : entry.title,
    amount: entry.amount,
    currency: entry.currency,
  };
}

/**
 * Queues the pushes for a change in a group (sent later, grouped, by the push
 * job): a visible notification for the members it concerns (shared
 * `notificationRecipients`) unless they muted it, and a silent sync push for
 * every other member with an account except the author.
 */
export async function enqueueNotification(db: Db, input: NotifyInput): Promise<void> {
  const groupMembers = await db.select().from(members).where(eq(members.groupId, input.groupId));
  const concerned = notificationRecipients(input.event, groupMembers, input.actorUserId);
  const muted = await mutedUsers(db, input.groupId, concerned);
  const notified = new Set(concerned.filter((u) => !muted.has(u)));
  const syncOnly = new Set(
    groupMembers
      .map((m) => m.userId)
      .filter((u): u is Id => u !== null && u !== input.actorUserId && !notified.has(u)),
  );

  const { event } = input;
  const actorName =
    // `null` = no name (removed, ADR-0019): the push reads "Deleted user" in the recipient's language.
    input.actorName !== undefined
      ? input.actorName
      : (groupMembers.find((m) => m.userId === input.actorUserId)?.displayName ?? null);
  const details: Omit<QueueInsert, 'id' | 'recipientUserId' | 'kind'> = {
    groupId: input.groupId,
    actorUserId: input.actorUserId,
    actorName,
    ...(event.type === 'entryCreated' || event.type === 'entryDeleted' ? entrySnapshot(event.entry) : {}),
    ...(event.type === 'entryEdited' ? entrySnapshot(event.after) : {}),
    ...(input.amount !== undefined ? { amount: input.amount, currency: input.currency ?? null } : {}),
    memberName: input.memberName ?? null,
  };
  const rows: QueueInsert[] = [
    ...[...notified].map((recipientUserId) => ({ id: randomUUID(), recipientUserId, kind: event.type, ...details })),
    ...[...syncOnly].map((recipientUserId) => ({ id: randomUUID(), recipientUserId, kind: 'sync' as const, ...details })),
  ];
  if (rows.length > 0) await db.insert(pushQueue).values(rows);
}

/** "<claimer> przejął profil <member>" for the other members of the group. */
export async function notifyClaim(
  db: Db,
  { groupId, memberId, userId, claimerName }: { groupId: Id; memberId: Id; userId: Id; claimerName: string },
): Promise<void> {
  const [member] = await db.select({ displayName: members.displayName }).from(members).where(eq(members.id, memberId));
  await notify(db, {
    groupId,
    actorUserId: userId,
    actorName: claimerName,
    event: { type: 'claim', memberId },
    ...(member?.displayName ? { memberName: member.displayName } : {}),
  });
}

/**
 * `enqueueNotification` that never fails the request it follows: the change
 * is already saved, a lost notification is only logged.
 */
export async function notify(db: Db, input: NotifyInput): Promise<void> {
  try {
    await enqueueNotification(db, input);
  } catch (error) {
    console.error('[push] could not queue a notification', error);
  }
}
