import { groupStats } from '@split-pay/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { entries } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { toEntryDto } from './entries';
import { findMyGroup } from './group-access';

/** The live entries of a group as shared `Entry` values — the input of `groupStats`. */
export async function liveEntries(db: Db, groupId: string) {
  const rows = await db
    .select()
    .from(entries)
    .where(and(eq(entries.groupId, groupId), isNull(entries.deletedAt)));
  return rows.map(toEntryDto);
}

/**
 * Group info → Stats, mounted at `/groups/:groupId/stats` inside the groups
 * sub-app (signed-in members only, 404 otherwise). The computation is the
 * shared, pure `groupStats`, so the view-only web (#19) can serve the same
 * shape from its public, token-scoped route.
 */
export const statsRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>()
    /** Days × people table and category breakdown in the group's base currency. */
    .get('/', async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      return c.json(groupStats(await liveEntries(db, group.id), group.baseCurrency), 200);
    });
