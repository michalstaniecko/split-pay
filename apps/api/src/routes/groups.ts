import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { Id, type Member, NewGroup } from '@split-pay/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import type { SessionUser } from '../auth';
import type { Db } from '../db/client';
import { groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';

type GroupRow = typeof groups.$inferSelect;
type MemberRow = typeof members.$inferSelect;

/** A group as the API returns it: the shared `Group` fields + owner and inbox ordering. */
const toGroupDto = (g: GroupRow) => ({
  id: g.id,
  name: g.name,
  emoji: g.emoji,
  color: g.color,
  baseCurrency: g.baseCurrency,
  startDate: g.startDate,
  endDate: g.endDate,
  simplifyDebts: g.simplifyDebts,
  archivedAt: g.archivedAt?.toISOString() ?? null,
  ownerMemberId: g.ownerMemberId,
  createdAt: g.createdAt.toISOString(),
  lastActivityAt: g.lastActivityAt.toISOString(),
});

const toMemberDto = (m: MemberRow): Member => ({
  id: m.id,
  groupId: m.groupId,
  displayName: m.displayName,
  userId: m.userId,
  attendance: m.attendance,
});

/** The owner's member name: the account name, else the email's local part. */
export function ownerDisplayName(user: Pick<SessionUser, 'name' | 'email'>): string {
  const name = user.name.trim() || user.email.split('@')[0] || user.email;
  return name.slice(0, 60);
}

/**
 * Groups of the signed-in user. Every query is scoped by membership: a group
 * the user is not a member of answers 404, as if it did not exist.
 */
export const groupsRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) => {
  /** The group, if the user is one of its members. */
  async function findMyGroup(groupId: string, userId: string) {
    const [row] = await db
      .select({ group: groups })
      .from(groups)
      .innerJoin(members, and(eq(members.groupId, groups.id), eq(members.userId, userId)))
      .where(eq(groups.id, groupId));
    return row?.group;
  }

  return (
    new Hono<AuthEnv>()
      .use(requireUser)
      /** My groups, most recent activity first (inbox). */
      .get('/', async (c) => {
        const rows = await db
          .select({ group: groups })
          .from(groups)
          .innerJoin(members, and(eq(members.groupId, groups.id), eq(members.userId, c.get('user').id)))
          .orderBy(desc(groups.lastActivityAt), desc(groups.createdAt), asc(groups.id));
        return c.json(rows.map((r) => toGroupDto(r.group)));
      })
      /**
       * Creates a group with the caller as owner and first member, in one
       * transaction. Idempotent on the client-generated id: repeating the same
       * create answers 200 with the existing group; someone else's id → 409.
       */
      .post('/', zValidator('json', NewGroup), async (c) => {
        const input = c.req.valid('json');
        const user = c.get('user');
        const created = await db.transaction(async (tx) => {
          const ownerMemberId = randomUUID();
          const [group] = await tx
            .insert(groups)
            .values({ ...input, ownerMemberId })
            .onConflictDoNothing({ target: groups.id })
            .returning();
          if (!group) return undefined;
          await tx.insert(members).values({
            id: ownerMemberId,
            groupId: group.id,
            displayName: ownerDisplayName(user),
            userId: user.id,
          });
          return group;
        });
        if (created) return c.json(toGroupDto(created), 201);

        const existing = await findMyGroup(input.id, user.id);
        if (!existing) return c.json({ error: 'conflict' as const }, 409);
        return c.json(toGroupDto(existing), 200);
      })
      /** One of my groups with its members. */
      .get('/:groupId', async (c) => {
        const groupId = c.req.param('groupId');
        const group = Id.safeParse(groupId).success ? await findMyGroup(groupId, c.get('user').id) : undefined;
        if (!group) return c.json({ error: 'not_found' as const }, 404);
        const rows = await db
          .select()
          .from(members)
          .where(eq(members.groupId, group.id))
          .orderBy(asc(members.createdAt), asc(members.id));
        return c.json({ ...toGroupDto(group), members: rows.map(toMemberDto) }, 200);
      })
  );
};
