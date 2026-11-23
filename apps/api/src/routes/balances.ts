import { zValidator } from '@hono/zod-validator';
import { GroupSettingsUpdate, type GroupSettingsSnapshot, settleUp } from '@split-pay/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { entries, groups, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { memberIdOfUser, recordChange } from './change-log';
import { toEntryDto } from './entries';
import { findMyGroup } from './group-access';

/**
 * The balance drawer, mounted at `/groups/:groupId/balances` inside the groups
 * sub-app. Computed with the shared ledger (`settleUp`), never in SQL.
 */
export const balancesRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>()
    /**
     * Every member's balance in the base currency (positive = others owe them,
     * members in Group info order) and the suggested transfers: simplified when
     * the group simplifies debts, pairwise otherwise.
     */
    .get('/', async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const [memberRows, entryRows] = await Promise.all([
        db
          .select({ id: members.id })
          .from(members)
          .where(eq(members.groupId, group.id))
          .orderBy(asc(members.createdAt), asc(members.id)),
        db
          .select()
          .from(entries)
          .where(and(eq(entries.groupId, group.id), isNull(entries.deletedAt))),
      ]);
      const { balances, transfers } = settleUp(
        entryRows.map(toEntryDto),
        group,
        memberRows.map((m) => m.id),
      );
      return c.json({ baseCurrency: group.baseCurrency, simplifyDebts: group.simplifyDebts, balances, transfers }, 200);
    });

/**
 * Group settings (Group info → settings), mounted at `/groups/:groupId/settings`.
 * Any member may change them (ADR-0008).
 */
export const groupSettingsRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>()
    /** Changes the given settings; answers with the updated settings. */
    .patch('/', zValidator('json', GroupSettingsUpdate), async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      const update = c.req.valid('json');
      const userId = c.get('user').id;
      const current = await db.transaction(async (tx) => {
        const [row] = await tx.select().from(groups).where(eq(groups.id, group.id)).for('update');
        if (!row) return group;
        // Only the settings that really change go into the change history.
        const keys = (Object.keys(update) as (keyof GroupSettingsUpdate)[]).filter(
          (k) => update[k] !== undefined && update[k] !== row[k],
        );
        if (keys.length === 0) return row;
        const before: GroupSettingsSnapshot = {};
        const after: GroupSettingsSnapshot = {};
        for (const k of keys) {
          before[k] = row[k];
          after[k] = update[k]!;
        }
        const [updated] = await tx.update(groups).set(after).where(eq(groups.id, group.id)).returning();
        await recordChange(tx, {
          kind: 'settings.update',
          groupId: group.id,
          targetId: group.id,
          actorMemberId: await memberIdOfUser(tx, group.id, userId),
          before,
          after,
        });
        return updated ?? row;
      });
      return c.json({ simplifyDebts: current.simplifyDebts }, 200);
    });
