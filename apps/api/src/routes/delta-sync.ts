import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { entries, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { findMyGroup } from './group-access';
import { toEntryDto } from './entries';
import { toGroupDto, toMemberDto } from './groups';

/**
 * How far before `since` a delta sync looks again. `updatedAt` is set when a
 * transaction runs, not when it commits (and by more than one clock), so a
 * change can become visible with a timestamp just below a cursor a client
 * already holds. Re-sending the last minute is cheap; clients upsert by id.
 */
export const DELTA_SYNC_OVERLAP_MS = 60_000;

const DeltaSyncQuery = z.object({ since: z.iso.datetime({ offset: true }).optional() });

/**
 * Delta sync of one group (ADR-0005), mounted at `/groups/:groupId/sync`.
 * `GET ?since=<ISO>` → `{ group, entries, cursor }`:
 * - `group`: the group with all its members (same shape as `GET /groups/:groupId`) — always whole, it is small and
 *   member removals need no tombstones;
 * - `entries`: entries changed after `since` (minus `DELTA_SYNC_OVERLAP_MS`), **soft-deleted ones included**; all of
 *   them without `since`;
 * - `cursor`: pass as the next `since` — the newest `updatedAt` returned, else `since` (null for an empty first sync).
 * 404 when the caller is not a member (left, removed, group deleted) — clients drop their copy.
 */
export const deltaSyncRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>().get('/', zValidator('query', DeltaSyncQuery), async (c) => {
    const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
    if (!group) return c.json({ error: 'not_found' as const }, 404);
    const { since } = c.req.valid('query');

    const [memberRows, entryRows] = await Promise.all([
      db.select().from(members).where(eq(members.groupId, group.id)).orderBy(asc(members.createdAt), asc(members.id)),
      db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.groupId, group.id),
            since ? gt(entries.updatedAt, new Date(Date.parse(since) - DELTA_SYNC_OVERLAP_MS)) : undefined,
          ),
        )
        .orderBy(asc(entries.updatedAt), asc(entries.id)),
    ]);
    const changed = entryRows.map(toEntryDto);
    const newest = changed.reduce<string | null>((max, e) => (max === null || e.updatedAt > max ? e.updatedAt : max), null);
    const cursor = newest !== null && (!since || newest > new Date(since).toISOString()) ? newest : (since ?? null);
    return c.json({ group: { ...toGroupDto(group), members: memberRows.map(toMemberDto) }, entries: changed, cursor }, 200);
  });
