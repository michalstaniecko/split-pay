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
import { memberIdOfUser, recordChange } from './change-log';
import { deltaSyncRoutes } from './delta-sync';
import { entriesRoutes, latestEntries } from './entries';
import { historyRoutes } from './history';
import { claimLinkRoutes, claimRoutes } from './claims';
import { groupLifecycleRoutes, rejectWritesToArchived } from './group-lifecycle';
import { groupLinkRoutes } from './group-links';
import { memberPayoutDetailsRoutes } from './payout-details';
import { statsRoutes } from './stats';

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

export const toMemberDto = (m: MemberRow): Member => ({
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
      /** Archived groups are read-only: every write below answers 409 (`routes/group-lifecycle.ts`). */
      .use('/:groupId/*', rejectWritesToArchived({ db }))
      /** Archive / unarchive, leave, permanent deletion: `routes/group-lifecycle.ts`. */
      .route('/:groupId', groupLifecycleRoutes({ db }))
      /** The group link (share, QR, revoke): `routes/group-links.ts`. */
      .route('/:groupId/link', groupLinkRoutes({ db }))
      /** Claims (system messages, undo) and personal claim links: `routes/claims.ts`. */
      .route('/:groupId/claims', claimRoutes({ db }))
      .route('/:groupId/members/:memberId/claim-link', claimLinkRoutes({ db }))
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
      /** Delta sync for the offline cache (ADR-0005): `routes/delta-sync.ts`. */
      .route('/:groupId/sync', deltaSyncRoutes({ db }))
      /** Balances + settle-up (balance drawer) and group settings: `routes/balances.ts`. */
      .route('/:groupId/balances', balancesRoutes({ db }))
      .route('/:groupId/settings', groupSettingsRoutes({ db }))
      /** A member's payout details ("Oddaj" sheet): `routes/payout-details.ts`. */
      .route('/:groupId/members/:memberId/payout-details', memberPayoutDetailsRoutes({ db }))
      .route('/:groupId/stats', statsRoutes({ db }))
      /** Change history + undo (#20): `routes/history.ts`. */
      .route('/:groupId/changes', historyRoutes({ db }))
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
          await recordChange(tx, {
            kind: 'group.create',
            groupId: group.id,
            targetId: group.id,
            actorMemberId: ownerMemberId,
            before: null,
            after: { name: group.name, emoji: group.emoji },
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
        const userId = c.get('user').id;
        const created = await db.transaction(async (tx) => {
          const [member] = await tx
            .insert(members)
            .values({ id: input.id, groupId: group.id, displayName: input.displayName, attendance: input.attendance ?? null })
            .onConflictDoNothing({ target: members.id })
            .returning();
          if (member) {
            await recordChange(tx, {
              kind: 'member.add',
              groupId: group.id,
              targetId: member.id,
              actorMemberId: await memberIdOfUser(tx, group.id, userId),
              before: null,
              after: { displayName: member.displayName },
            });
          }
          return member;
        });
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

        const displayName = c.req.valid('json').displayName;
        const renamed = await db.transaction(async (tx) => {
          const [row] = await tx.update(members).set({ displayName }).where(eq(members.id, member.id)).returning();
          if (row && row.displayName !== member.displayName) {
            await recordChange(tx, {
              kind: 'member.rename',
              groupId: group.id,
              targetId: member.id,
              actorMemberId: await memberIdOfUser(tx, group.id, userId),
              before: { displayName: member.displayName },
              after: { displayName: row.displayName },
            });
          }
          return row;
        });
        return c.json(toMemberDto(renamed ?? member), 200);
      })
      /**
       * Sets a member's attendance (canonical form, `null` = whole trip). Any
       * member may edit anyone's attendance (ADR-0008). Existing entries keep
       * their participants (ADR-0016) — only new entries' defaults follow it.
       */
      .put('/:groupId/members/:memberId/attendance', zValidator('json', MemberAttendanceUpdate), async (c) => {
        const { groupId, memberId } = c.req.param();
        const userId = c.get('user').id;
        const group = Id.safeParse(groupId).success ? await findMyGroup(groupId, userId) : undefined;
        if (!group || !Id.safeParse(memberId).success) return c.json({ error: 'not_found' as const }, 404);
        const { attendance } = c.req.valid('json');
        const updated = await db.transaction(async (tx) => {
          const [before] = await tx
            .select()
            .from(members)
            .where(and(eq(members.id, memberId), eq(members.groupId, group.id)))
            .for('update');
          if (!before) return undefined;
          const [row] = await tx.update(members).set({ attendance }).where(eq(members.id, before.id)).returning();
          if (row && JSON.stringify(row.attendance) !== JSON.stringify(before.attendance)) {
            await recordChange(tx, {
              kind: 'member.attendance',
              groupId: group.id,
              targetId: row.id,
              actorMemberId: await memberIdOfUser(tx, group.id, userId),
              before: { attendance: before.attendance },
              after: { attendance: row.attendance },
            });
          }
          return row;
        });
        if (!updated) return c.json({ error: 'not_found' as const }, 404);
        return c.json(toMemberDto(updated), 200);
      })
  );
};
