import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { ClaimMember, claimableMembers, Id } from '@split-pay/shared';
import { asc, eq } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Db } from '../db/client';
import { groupLinks, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { claimMember, findMyMember, newLinkToken, resolveLinkToken } from './claims';
import { ownerDisplayName } from './groups';

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
        await db.insert(groupLinks).values({ groupId, token: newLinkToken() }).onConflictDoNothing({ target: groupLinks.groupId });
        const [link] = await db.select().from(groupLinks).where(eq(groupLinks.groupId, groupId));
        if (!link) throw new Error(`group link of ${groupId} vanished`);
        return c.json({ token: link.token }, 200);
      })
      /** Revokes the current token and generates a new one. */
      .post('/revoke', async (c) => {
        const groupId = await myGroupId(c.req.param('groupId'), c.get('user').id);
        if (!groupId) return c.json({ error: 'not_found' as const }, 404);
        const token = newLinkToken();
        await db
          .insert(groupLinks)
          .values({ groupId, token })
          .onConflictDoUpdate({ target: groupLinks.groupId, set: { token, createdAt: new Date() } });
        return c.json({ token }, 200);
      })
  );
};

/**
 * Opening a link in the app (`/links/:token`): a group link or a personal
 * claim link (`routes/claims.ts` → `resolveLinkToken`). Requires a session.
 * Unknown and revoked tokens answer 404.
 */
export const linksRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) =>
  new Hono<AuthEnv>()
    .use(requireUser)
    /**
     * What the join screen shows: the group, how many members it has, whether
     * I'm one, and the members without an account I could claim. A personal
     * claim link (`claimFor`) offers only its member.
     */
    .get('/:token', async (c) => {
      const link = await resolveLinkToken(db, c.req.param('token'));
      if (!link) return c.json({ error: 'not_found' as const }, 404);
      const { group, claimFor } = link;
      const all = await db
        .select()
        .from(members)
        .where(eq(members.groupId, group.id))
        .orderBy(asc(members.createdAt), asc(members.id));
      const isMember = all.some((m) => m.userId === c.get('user').id);
      const claimable = isMember
        ? []
        : claimableMembers(all)
            .filter((m) => claimFor === null || m.id === claimFor)
            .map((m) => ({ id: m.id, displayName: m.displayName }));
      return c.json(
        {
          group: { id: group.id, name: group.name, emoji: group.emoji, color: group.color },
          memberCount: all.length,
          isMember,
          claimable,
          claimFor,
        },
        200,
      );
    })
    /**
     * Joins as a new person: adds the caller as a member named after their
     * account. Already a member → 200 with the existing member.
     */
    .post('/:token/join', async (c) => {
      const link = await resolveLinkToken(db, c.req.param('token'));
      if (!link) return c.json({ error: 'not_found' as const }, 404);
      const { group } = link;
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
    /**
     * Claims a member without an account (ADR-0007). A personal claim link
     * claims only its member. 201 claimed, 200 already mine; 409
     * `already_claimed` (the member has an account) or `already_member` (I'm
     * already a member of the group — one member per user).
     */
    .post('/:token/claim', zValidator('json', ClaimMember), async (c) => {
      const link = await resolveLinkToken(db, c.req.param('token'));
      const { memberId } = c.req.valid('json');
      if (!link || (link.claimFor !== null && link.claimFor !== memberId)) {
        return c.json({ error: 'not_found' as const }, 404);
      }
      const user = c.get('user');
      const groupId = link.group.id;
      const result = await claimMember(db, { groupId, memberId, user }, ownerDisplayName(user));
      if (result.status === 'claimed') return c.json({ groupId, memberId: result.memberId }, 201);
      if (result.status === 'already_mine') return c.json({ groupId, memberId: result.memberId }, 200);
      if (result.status === 'not_found') return c.json({ error: 'not_found' as const }, 404);
      return c.json({ error: result.status }, 409);
    });
