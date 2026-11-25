import { defaultPushBurstOptions, groupPushBursts, type PushBurstOptions, pushMessageBody } from '@split-pay/shared';
import { asc, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { groups, pushQueue, pushTokens } from '../db/schema';
import type { PushData, PushMessage, PushSender } from './sender';

type QueueRow = typeof pushQueue.$inferSelect;

/** Queue rows handled per run; the rest waits for the next one. */
const BATCH = 5000;

function message(burst: QueueRow[], to: string, locale: string, groupTitle: string): PushMessage {
  const newest = burst.at(-1)!;
  if (newest.kind === 'sync') {
    return { to, data: { type: 'sync', groupId: newest.groupId }, _contentAvailable: true, priority: 'normal' };
  }
  // Tapping opens the Conversation at the entry's bubble — unless it is gone.
  const scrollTo = newest.kind === 'entryCreated' || newest.kind === 'entryEdited' ? newest.entryId : null;
  const data: PushData = { type: 'notification', groupId: newest.groupId, ...(scrollTo ? { entryId: scrollTo } : {}) };
  const body = pushMessageBody(
    {
      kind: newest.kind,
      entryKind: newest.entryKind,
      count: burst.length,
      actorName: newest.actorName,
      entryTitle: newest.entryTitle,
      amount: newest.amount,
      currency: newest.currency,
      memberName: newest.memberName,
    },
    locale,
  );
  return { to, title: groupTitle, body, data, sound: 'default', _contentAvailable: true, priority: 'high' };
}

/**
 * One run of the push job: groups queued pushes into bursts (shared
 * `groupPushBursts`), sends the bursts that are over to every device of
 * their recipient and removes them from the queue. Tokens Expo reports as
 * `DeviceNotRegistered` are forgotten.
 */
export async function dispatchPushes(
  db: Db,
  sender: PushSender,
  options: { now?: Date; bursts?: PushBurstOptions } = {},
): Promise<{ sent: number }> {
  const now = options.now ?? new Date();
  const queued = await db.select().from(pushQueue).orderBy(asc(pushQueue.createdAt)).limit(BATCH);
  const ready = groupPushBursts(
    queued.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    now.toISOString(),
    options.bursts ?? defaultPushBurstOptions,
  ).map((burst) => burst.map((p) => ({ ...p, createdAt: new Date(p.createdAt) })));
  if (ready.length === 0) return { sent: 0 };

  const recipientIds = [...new Set(ready.map((b) => b[0]!.recipientUserId))];
  const groupIds = [...new Set(ready.map((b) => b[0]!.groupId))];
  const [tokens, groupRows] = await Promise.all([
    db.select().from(pushTokens).where(inArray(pushTokens.userId, recipientIds)),
    db.select({ id: groups.id, name: groups.name, emoji: groups.emoji }).from(groups).where(inArray(groups.id, groupIds)),
  ]);
  const titles = new Map(groupRows.map((g) => [g.id, `${g.emoji} ${g.name}`]));

  const messages = ready.flatMap((burst) => {
    const first = burst[0]!;
    return tokens
      .filter((t) => t.userId === first.recipientUserId)
      .map((t) => message(burst, t.token, t.locale, titles.get(first.groupId) ?? ''));
  });
  const tickets = messages.length > 0 ? await sender.send(messages) : [];

  const gone = messages
    .filter((_, i) => {
      const ticket = tickets[i];
      return ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered';
    })
    .map((m) => m.to);
  if (gone.length > 0) await db.delete(pushTokens).where(inArray(pushTokens.token, gone));
  await db.delete(pushQueue).where(inArray(pushQueue.id, ready.flat().map((p) => p.id)));
  return { sent: messages.length };
}

/**
 * Runs `dispatchPushes` every `intervalMs` (started by `index.ts` only). `onError` gets
 * the error of a failed run (error reporting, #64).
 */
export function startPushJob({
  db,
  sender,
  intervalMs = 10_000,
  onError,
}: {
  db: Db;
  sender: PushSender;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await dispatchPushes(db, sender);
    } catch (error) {
      console.error('[push] dispatch failed', error);
      onError?.(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
