import { randomBytes, randomUUID } from 'node:crypto';
import { Id } from '@split-pay/shared';
import { and, count, eq } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Db } from '../db/client';
import { groupLinks, groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { ownerDisplayName } from './groups';

/** 24 random bytes → 32 URL-safe characters. */
const newToken = () => randomBytes(24).toString('base64url');

/** The user's member in the group, if any. */
async function findMyMember(db: Db, groupId: string, userId: string) {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.userId, userId)));
  return member;
}

/**
 * The group link of one group (ADR-0009), mounted under `/groups/:groupId/link`
 * by `groupsRoutes` (which already requires a session). Any member may see,
 * share and revoke it; for anyone else the group doesn't exist (404).
 */
export const groupLinkRoutes = ({ db }: { db: Db }) => {
  /** The group id, if the caller is one of its members. */
  async function myGroupId(groupId: string | undefined, userId: string) {
    if (!groupId || !Id.safeParse(groupId).success) return undefined;
    return (await findMyMember(db, groupId, userId))?.groupId;
  }

  return (
    new Hono<AuthEnv>()
      /** The current token; the first call creates it. */
      .get('/', async (c) => {
        const groupId = await myGroupId(c.req.param('groupId'), c.get('user').id);
        if (!groupId) return c.json({ error: 'not_found' as const }, 404);
        await db.insert(groupLinks).values({ groupId, token: newToken() }).onConflictDoNothing({ target: groupLinks.groupId });
        const [link] = await db.select().from(groupLinks).where(eq(groupLinks.groupId, groupId));
        if (!link) throw new Error(`group link of ${groupId} vanished`);
        return c.json({ token: link.token }, 200);
      })
      /** Revokes the current token and generates a new one. */
      .post('/revoke', async (c) => {
        const groupId = await myGroupId(c.req.param('groupId'), c.get('user').id);
        if (!groupId) return c.json({ error: 'not_found' as const }, 404);
        const token = newToken();
        await db
          .insert(groupLinks)
          .values({ groupId, token })
          .onConflictDoUpdate({ target: groupLinks.groupId, set: { token, createdAt: new Date() } });
        return c.json({ token }, 200);
      })
  );
};

/**
 * Opening a group link in the app (`/links/:token`). Requires a session.
 * Unknown and revoked tokens answer 404.
 */
export const linksRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) => {
  async function groupOf(token: string) {
    const [row] = await db
      .select({ group: groups })
      .from(groupLinks)
      .innerJoin(groups, eq(groups.id, groupLinks.groupId))
      .where(eq(groupLinks.token, token));
    return row?.group;
  }

  return (
    new Hono<AuthEnv>()
      .use(requireUser)
      /** What the join screen shows: the group, how many members it has, whether I'm one. */
      .get('/:token', async (c) => {
        const group = await groupOf(c.req.param('token'));
        if (!group) return c.json({ error: 'not_found' as const }, 404);
        const [counted] = await db.select({ n: count() }).from(members).where(eq(members.groupId, group.id));
        const mine = await findMyMember(db, group.id, c.get('user').id);
        return c.json(
          {
            group: { id: group.id, name: group.name, emoji: group.emoji, color: group.color },
            memberCount: counted?.n ?? 0,
            isMember: !!mine,
          },
          200,
        );
      })
      /**
       * Joins as a new person: adds the caller as a member named after their
       * account. Already a member → 200 with the existing member.
       */
      .post('/:token/join', async (c) => {
        const group = await groupOf(c.req.param('token'));
        if (!group) return c.json({ error: 'not_found' as const }, 404);
        const user = c.get('user');
        // The partial unique index (group_id, user_id) makes concurrent joins add one member.
        const [created] = await db
          .insert(members)
          .values({ id: randomUUID(), groupId: group.id, displayName: ownerDisplayName(user), userId: user.id })
          .onConflictDoNothing()
          .returning();
        if (created) return c.json({ groupId: group.id, memberId: created.id }, 201);

        const existing = await findMyMember(db, group.id, user.id);
        if (!existing) throw new Error(`join of ${group.id} conflicted without a member`);
        return c.json({ groupId: group.id, memberId: existing.id }, 200);
      })
  );
};
