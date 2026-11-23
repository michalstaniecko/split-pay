import { zValidator } from '@hono/zod-validator';
import type { ActivityItem, ActivityPage } from '@split-pay/shared';
import { and, desc, eq, inArray, isNull, lt, max, notInArray, or } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { changes, groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { withUndoneBy } from './history';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const digits = z.string().regex(/^\d{1,15}$/);

const ActivityQuery = z.object({
  /** `nextCursor` of the previous page: only changes older than it. */
  cursor: digits.transform(Number).optional(),
  limit: digits.transform(Number).pipe(z.number().int().min(1).max(MAX_LIMIT)).optional(),
});

/**
 * Activity (#21): the change history (#20) of all the signed-in user's
 * groups in one feed, newest first, paged by a cursor (the change's `seq`,
 * global insertion order). Only groups the user is a member of right now —
 * leaving a group takes its changes out of the feed.
 */
export const activityRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) => {
  /** The user's members — one per group they belong to. */
  const myMembers = (userId: string) =>
    db.select({ id: members.id, groupId: members.groupId }).from(members).where(eq(members.userId, userId));

  return (
    new Hono<AuthEnv>()
      .use(requireUser)
      /**
       * When someone else last changed something in one of my groups (`null`:
       * never). The app compares it with when Activity was last opened on the
       * device to show the bell's unread dot.
       */
      .get('/latest', async (c) => {
        const mine = await myMembers(c.get('user').id);
        if (mine.length === 0) return c.json({ latestByOthersAt: null as string | null }, 200);
        const [row] = await db
          .select({ at: max(changes.createdAt) })
          .from(changes)
          .where(
            and(
              inArray(
                changes.groupId,
                mine.map((m) => m.groupId),
              ),
              or(
                isNull(changes.actorMemberId),
                notInArray(
                  changes.actorMemberId,
                  mine.map((m) => m.id),
                ),
              ),
            ),
          );
        return c.json({ latestByOthersAt: row?.at?.toISOString() ?? null }, 200);
      })
      .get('/', zValidator('query', ActivityQuery), async (c) => {
        const { cursor, limit = DEFAULT_LIMIT } = c.req.valid('query');
        const mine = await myMembers(c.get('user').id);
        if (mine.length === 0) return c.json<ActivityPage>({ items: [], memberNames: {}, nextCursor: null }, 200);

        const rows = await db
          .select()
          .from(changes)
          .where(
            and(
              inArray(
                changes.groupId,
                mine.map((m) => m.groupId),
              ),
              cursor === undefined ? undefined : lt(changes.seq, cursor),
            ),
          )
          .orderBy(desc(changes.seq))
          .limit(limit + 1);
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        const nextCursor = rows.length > limit && last ? String(last.seq) : null;

        const groupIds = [...new Set(page.map((r) => r.groupId))];
        const [groupRows, memberRows] =
          groupIds.length === 0
            ? [[], []]
            : await Promise.all([
                db
                  .select({ id: groups.id, name: groups.name, emoji: groups.emoji, color: groups.color })
                  .from(groups)
                  .where(inArray(groups.id, groupIds)),
                db
                  .select({ id: members.id, displayName: members.displayName })
                  .from(members)
                  .where(inArray(members.groupId, groupIds)),
              ]);
        const groupById = new Map(groupRows.map((g) => [g.id, g]));
        const myMemberIds = new Set(mine.map((m) => m.id));

        const items = (await withUndoneBy(db, page)).flatMap((change): ActivityItem[] => {
          const group = groupById.get(change.groupId);
          if (!group) return [];
          const byMe = change.actorMemberId !== null && myMemberIds.has(change.actorMemberId);
          return [{ ...change, group, byMe }];
        });
        const memberNames = Object.fromEntries(memberRows.map((m) => [m.id, m.displayName]));
        return c.json<ActivityPage>({ items, memberNames, nextCursor }, 200);
      })
  );
};
