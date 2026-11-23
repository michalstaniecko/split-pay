import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import {
  canNudge,
  NotificationSetting,
  nextNudgeAt,
  NUDGE_INTERVAL_MS,
  NudgeRequest,
  PushTokenRegistration,
  PushTokenRemoval,
  settleUp,
} from '@split-pay/shared';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Db } from '../db/client';
import { groupNotificationSettings, members, notificationSettings, nudges, pushTokens } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { notify } from '../push/enqueue';
import { findMyGroup } from './group-access';
import { liveEntries } from './stats';

/**
 * This device's push token, mounted at `/me/push-tokens`. Registered after
 * sign-in; tied to the session, so signing out removes it even if the app
 * can't call DELETE first.
 */
export const myPushTokenRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) =>
  new Hono<AuthEnv>()
    .use(requireUser)
    /** Registers (or moves to me) a device's token. */
    .put('/', zValidator('json', PushTokenRegistration), async (c) => {
      const { token, platform, locale } = c.req.valid('json');
      const owner = { userId: c.get('user').id, sessionId: c.get('session').id, platform, locale };
      await db
        .insert(pushTokens)
        .values({ token, ...owner })
        .onConflictDoUpdate({ target: pushTokens.token, set: { ...owner, updatedAt: new Date() } });
      return c.json({ registered: true as const }, 200);
    })
    /** Removes my token (before signing out). */
    .delete('/', zValidator('json', PushTokenRemoval), async (c) => {
      await db
        .delete(pushTokens)
        .where(and(eq(pushTokens.token, c.req.valid('json').token), eq(pushTokens.userId, c.get('user').id)));
      return c.json({ removed: true as const }, 200);
    });

/** The global notifications switch (Profile), mounted at `/me/notifications`. */
export const myNotificationSettingsRoutes = ({
  db,
  requireUser,
}: {
  db: Db;
  requireUser: MiddlewareHandler<AuthEnv>;
}) =>
  new Hono<AuthEnv>()
    .use(requireUser)
    .get('/', async (c) => {
      const [row] = await db
        .select()
        .from(notificationSettings)
        .where(eq(notificationSettings.userId, c.get('user').id));
      return c.json({ enabled: row?.enabled ?? true }, 200);
    })
    .put('/', zValidator('json', NotificationSetting), async (c) => {
      const { enabled } = c.req.valid('json');
      const userId = c.get('user').id;
      await db
        .insert(notificationSettings)
        .values({ userId, enabled })
        .onConflictDoUpdate({ target: notificationSettings.userId, set: { enabled } });
      return c.json({ enabled }, 200);
    });

/**
 * Per-group notifications switch and "Przypomnij" nudges, mounted at
 * `/groups/:groupId` inside the groups sub-app (signed-in members only; 404
 * for anyone else).
 */
export const groupPushRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>()
    /** My notifications switch for this group (Group info → settings). */
    .get('/notifications', async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const [row] = await db
        .select()
        .from(groupNotificationSettings)
        .where(and(eq(groupNotificationSettings.groupId, group.id), eq(groupNotificationSettings.userId, userId)));
      return c.json({ enabled: row?.enabled ?? true }, 200);
    })
    .put('/notifications', zValidator('json', NotificationSetting), async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const { enabled } = c.req.valid('json');
      await db
        .insert(groupNotificationSettings)
        .values({ groupId: group.id, userId, enabled })
        .onConflictDoUpdate({
          target: [groupNotificationSettings.groupId, groupNotificationSettings.userId],
          set: { enabled },
        });
      return c.json({ enabled }, 200);
    })
    /** Members nudged in the last 24 h (by anyone) and when they can be nudged again. */
    .get('/nudges', async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const rows = await db
        .selectDistinctOn([nudges.toMemberId], { memberId: nudges.toMemberId, createdAt: nudges.createdAt })
        .from(nudges)
        .where(and(eq(nudges.groupId, group.id), gt(nudges.createdAt, new Date(Date.now() - NUDGE_INTERVAL_MS))))
        .orderBy(asc(nudges.toMemberId), desc(nudges.createdAt));
      return c.json(
        rows.map((r) => ({
          memberId: r.memberId,
          nudgedAt: r.createdAt.toISOString(),
          nextNudgeAt: nextNudgeAt(r.createdAt.toISOString())!,
        })),
        200,
      );
    })
    /**
     * "Przypomnij": pushes a reminder to a member with an account who owes me
     * (a suggested transfer to me). Once per member per group per 24 h — 429
     * `nudge_limit` with `nextNudgeAt` until then. 400 for myself, a member
     * without an account or one who owes me nothing; 409 archived group.
     */
    .post('/nudges', zValidator('json', NudgeRequest), async (c) => {
      const user = c.get('user');
      const group = await findMyGroup(db, c.req.param('groupId'), user.id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      if (group.archivedAt !== null) return c.json({ error: 'archived' as const }, 409);
      const { memberId } = c.req.valid('json');
      const groupMembers = await db
        .select()
        .from(members)
        .where(eq(members.groupId, group.id))
        .orderBy(asc(members.createdAt), asc(members.id));
      const me = groupMembers.find((m) => m.userId === user.id)!;
      const debtor = groupMembers.find((m) => m.id === memberId);
      if (!debtor) return c.json({ error: 'not_found' as const }, 404);
      if (debtor.id === me.id) return c.json({ error: 'invalid_nudge' as const }, 400);
      if (debtor.userId === null) return c.json({ error: 'no_account' as const }, 400);
      const { transfers } = settleUp(
        await liveEntries(db, group.id),
        group,
        groupMembers.map((m) => m.id),
      );
      const owed = transfers.find((t) => t.from === debtor.id && t.to === me.id);
      if (!owed) return c.json({ error: 'nothing_owed' as const }, 400);

      const result = await db.transaction(async (tx) => {
        // Serializes nudges of this member, so two at once can't both pass the limit.
        await tx.select({ id: members.id }).from(members).where(eq(members.id, debtor.id)).for('update');
        const [last] = await tx
          .select({ createdAt: nudges.createdAt })
          .from(nudges)
          .where(and(eq(nudges.groupId, group.id), eq(nudges.toMemberId, debtor.id)))
          .orderBy(desc(nudges.createdAt))
          .limit(1);
        const lastAt = last?.createdAt.toISOString() ?? null;
        const now = new Date();
        if (!canNudge(lastAt, now.toISOString())) return { allowed: false as const, nextNudgeAt: nextNudgeAt(lastAt)! };
        await tx
          .insert(nudges)
          .values({ id: randomUUID(), groupId: group.id, fromMemberId: me.id, toMemberId: debtor.id, createdAt: now });
        return { allowed: true as const, nudgedAt: now.toISOString() };
      });
      if (!result.allowed) {
        return c.json({ error: 'nudge_limit' as const, nextNudgeAt: result.nextNudgeAt }, 429);
      }
      await notify(db, {
        groupId: group.id,
        actorUserId: user.id,
        event: { type: 'nudge', toMemberId: debtor.id },
        amount: owed.amount,
        currency: group.baseCurrency,
      });
      return c.json(
        { memberId: debtor.id, nudgedAt: result.nudgedAt, nextNudgeAt: nextNudgeAt(result.nudgedAt)! },
        201,
      );
    });
