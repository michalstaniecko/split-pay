import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { canRenameMember, Id, type Member, MemberAttendanceUpdate, MemberRename, NewGroup, NewMember } from '@split-pay/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import type { SessionUser } from '../auth';
import type { Db } from '../db/client';
import { groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { balancesRoutes, groupSettingsRoutes } from './balances';
import { entriesRoutes, latestEntries } from './entries';
import { groupLinkRoutes } from './group-links';
import { memberPayoutDetailsRoutes } from './payout-details';

type GroupRow = typeof groups.$inferSelect;
type MemberRow = typeof members.$inferSelect;

/** A group as the API returns it: the shared `Group` fields + owner and inbox ordering. */
export const toGroupDto = (g: GroupRow) => ({
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
      /** The group link (share, QR, revoke): `routes/group-links.ts`. */
      .route('/:groupId/link', groupLinkRoutes({ db }))
      /** My groups, most recent activity first (inbox). */
      .get('/', async (c) => {
        const rows = await db
          .select({ group: groups })
          .from(groups)
          .innerJoin(members, and(eq(members.groupId, groups.id), eq(members.userId, c.get('user').id)))
          .orderBy(desc(groups.lastActivityAt), desc(groups.createdAt), asc(groups.id));
        const previews = await latestEntries(
          db,
          rows.map((r) => r.group.id),
        );
        // `lastEntry`: the most recently added entry, previewed in the inbox row.
        return c.json(rows.map((r) => ({ ...toGroupDto(r.group), lastEntry: previews.get(r.group.id) ?? null })));
      })
      .route('/:groupId/entries', entriesRoutes({ db }))
      /** Balances + settle-up (balance drawer) and group settings: `routes/balances.ts`. */
      .route('/:groupId/balances', balancesRoutes({ db }))
      .route('/:groupId/settings', groupSettingsRoutes({ db }))
      /** A member's payout details ("Oddaj" sheet): `routes/payout-details.ts`. */
      .route('/:groupId/members/:memberId/payout-details', memberPayoutDetailsRoutes({ db }))
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
      /**
       * Adds a member without an account (ADR-0007) — any member may. Idempotent
       * on the client-generated id: repeating the add answers 200 with the
       * existing member; an id used in another group → 409.
       */
      .post('/:groupId/members', zValidator('json', NewMember), async (c) => {
        const groupId = c.req.param('groupId');
        const group = Id.safeParse(groupId).success ? await findMyGroup(groupId, c.get('user').id) : undefined;
        if (!group) return c.json({ error: 'not_found' as const }, 404);
        const input = c.req.valid('json');
        const [created] = await db
          .insert(members)
          .values({ id: input.id, groupId: group.id, displayName: input.displayName, attendance: input.attendance ?? null })
          .onConflictDoNothing({ target: members.id })
          .returning();
        if (created) return c.json(toMemberDto(created), 201);

        const [existing] = await db
          .select()
          .from(members)
          .where(and(eq(members.id, input.id), eq(members.groupId, group.id)));
        if (!existing) return c.json({ error: 'conflict' as const }, 409);
        return c.json(toMemberDto(existing), 200);
      })
      /**
       * Renames a member. Any member renames a member without an account
       * (ADR-0008) or themselves; a member with an account can't be renamed by others.
       */
      .patch('/:groupId/members/:memberId', zValidator('json', MemberRename), async (c) => {
        const { groupId, memberId } = c.req.param();
        const userId = c.get('user').id;
        const group = Id.safeParse(groupId).success ? await findMyGroup(groupId, userId) : undefined;
        if (!group || !Id.safeParse(memberId).success) return c.json({ error: 'not_found' as const }, 404);
        const [member] = await db
          .select()
          .from(members)
          .where(and(eq(members.id, memberId), eq(members.groupId, group.id)));
        if (!member) return c.json({ error: 'not_found' as const }, 404);
        if (!canRenameMember(member, userId)) return c.json({ error: 'forbidden' as const }, 403);

        const [renamed] = await db
          .update(members)
          .set({ displayName: c.req.valid('json').displayName })
          .where(eq(members.id, member.id))
          .returning();
        return c.json(toMemberDto(renamed ?? member), 200);
      })
      /**
       * Sets a member's attendance (canonical form, `null` = whole trip). Any
       * member may edit anyone's attendance (ADR-0008). Existing entries keep
       * their participants (ADR-0016) — only new entries' defaults follow it.
       */
      .put('/:groupId/members/:memberId/attendance', zValidator('json', MemberAttendanceUpdate), async (c) => {
        const { groupId, memberId } = c.req.param();
        const group = Id.safeParse(groupId).success ? await findMyGroup(groupId, c.get('user').id) : undefined;
        if (!group || !Id.safeParse(memberId).success) return c.json({ error: 'not_found' as const }, 404);
        const [updated] = await db
          .update(members)
          .set({ attendance: c.req.valid('json').attendance })
          .where(and(eq(members.id, memberId), eq(members.groupId, group.id)))
          .returning();
        if (!updated) return c.json({ error: 'not_found' as const }, 404);
        return c.json(toMemberDto(updated), 200);
      })
  );
};
