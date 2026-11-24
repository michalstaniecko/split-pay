import { canDeleteGroup, canLeaveGroup, Id, settleUp } from '@split-pay/shared';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Db } from '../db/client';
import { entries, groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { memberIdOfUser, recordChange } from './change-log';
import { toEntryDto } from './entries';
import { findMyGroup } from './group-access';
import { toGroupDto } from './groups';

/** The answer to any write into an archived group. */
export const archivedResponse = { error: 'archived' as const };

/**
 * An archived group is fully read-only (SPEC "Data model"): every write under
 * `/groups/:groupId/…` answers 409 `{ error: 'archived' }`, whatever route a
 * slice adds. Only the lifecycle itself stays open: unarchive, leave and
 * permanent deletion — plus the caller's personal per-group notifications
 * switch, which isn't group data (muting an archived group is fine). Reads pass. Non-members fall through to the route, which
 * answers 404 as usual (existence doesn't leak).
 */
export const rejectWritesToArchived = ({ db }: { db: Db }) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') return next();
    const groupId = c.req.param('groupId');
    const rest = c.req.path.slice(c.req.path.indexOf(`/${groupId}`) + 1 + (groupId?.length ?? 0));
    const lifecycle =
      rest === '/archive' || rest === '/leave' || ((rest === '' || rest === '/') && c.req.method === 'DELETE');
    const personal = rest === '/notifications';
    if (lifecycle || personal) return next();
    const group = await findMyGroup(db, groupId, c.get('user').id);
    if (group?.archivedAt) return c.json(archivedResponse, 409);
    return next();
  });

/**
 * Group lifecycle, mounted at `/groups/:groupId` inside the groups sub-app:
 * archive / unarchive (any member, ADR-0008), leave (zero balance only) and
 * permanent deletion (owner only — see `canDeleteGroup`).
 */
export const groupLifecycleRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>()
    /** Archives the group (read-only). Idempotent: an archived group keeps its archive time. */
    .put('/archive', async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      if (group.archivedAt) return c.json(toGroupDto(group), 200);
      const userId = c.get('user').id;
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(groups)
          .set({ archivedAt: new Date() })
          .where(and(eq(groups.id, group.id), isNull(groups.archivedAt)))
          .returning();
        if (row) {
          const actorMemberId = await memberIdOfUser(tx, group.id, userId);
          await recordChange(tx, { kind: 'group.archive', groupId: group.id, targetId: group.id, actorMemberId, before: null, after: null });
        }
        return row;
      });
      const [current] = updated ? [updated] : await db.select().from(groups).where(eq(groups.id, group.id));
      return c.json(toGroupDto(current ?? group), 200);
    })
    /** Unarchives the group. Idempotent. */
    .delete('/archive', async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const userId = c.get('user').id;
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(groups)
          .set({ archivedAt: null })
          .where(and(eq(groups.id, group.id), isNotNull(groups.archivedAt)))
          .returning();
        if (row) {
          const actorMemberId = await memberIdOfUser(tx, group.id, userId);
          await recordChange(tx, { kind: 'group.unarchive', groupId: group.id, targetId: group.id, actorMemberId, before: null, after: null });
        }
        return row;
      });
      return c.json(toGroupDto(updated ?? group), 200);
    })
    /**
     * Leaves the group — only with a zero balance (409 `non_zero_balance` with
     * the balance otherwise). The member stays, as a member without an account
     * under the same name: entries reference it, so history and others'
     * balances are untouched, and it can be claimed again. Allowed in an
     * archived group (it changes my access, not the group's data).
     */
    .post('/leave', async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const result = await db.transaction(async (tx) => {
        const memberRows = await tx.select().from(members).where(eq(members.groupId, group.id));
        const me = memberRows.find((m) => m.userId === userId);
        // Left concurrently.
        if (!me) return { left: true as const, balance: 0 };
        const entryRows = await tx
          .select()
          .from(entries)
          .where(and(eq(entries.groupId, group.id), isNull(entries.deletedAt)));
        const { balances } = settleUp(
          entryRows.map(toEntryDto),
          group,
          memberRows.map((m) => m.id),
        );
        const balance = balances.find((b) => b.memberId === me.id)?.amount ?? 0;
        if (!canLeaveGroup(balance)) return { left: false as const, balance };
        await tx
          .update(members)
          .set({ userId: null })
          .where(and(eq(members.id, me.id), eq(members.userId, userId)));
        await recordChange(tx, {
          kind: 'member.leave',
          groupId: group.id,
          targetId: me.id,
          actorMemberId: me.id,
          before: null,
          after: null,
        });
        return { left: true as const, balance };
      });
      if (!result.left) return c.json({ error: 'non_zero_balance' as const, balance: result.balance }, 409);
      return c.json({ left: true as const }, 200);
    })
    /**
     * Permanently deletes the group with its members, entries, links and
     * claims (FK cascade). Owner only (`canDeleteGroup`: anyone once the owner
     * member has no account) — 403 otherwise. Allowed in an archived group.
     */
    .delete('/', async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const memberRows = await db
        .select({ id: members.id, userId: members.userId })
        .from(members)
        .where(eq(members.groupId, group.id));
      if (!canDeleteGroup(group, memberRows, userId)) return c.json({ error: 'forbidden' as const }, 403);
      await db.delete(groups).where(eq(groups.id, group.id));
      return c.json({ deleted: true as const }, 200);
    });
