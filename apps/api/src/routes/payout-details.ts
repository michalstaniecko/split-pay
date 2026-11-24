import { zValidator } from '@hono/zod-validator';
import { Id, PayoutDetails } from '@split-pay/shared';
import { and, eq } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Db } from '../db/client';
import { members, payoutDetails } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { findMyGroup } from './group-access';

const none: PayoutDetails = { bankAccount: null, blikPhone: null };

async function payoutDetailsOf(db: Db, userId: string): Promise<PayoutDetails> {
  const [row] = await db.select().from(payoutDetails).where(eq(payoutDetails.userId, userId));
  return row ? { bankAccount: row.bankAccount, blikPhone: row.blikPhone } : none;
}

/** My payout details (Profile), mounted at `/me/payout-details`. */
export const myPayoutDetailsRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) =>
  new Hono<AuthEnv>()
    .use(requireUser)
    .get('/', async (c) => c.json(await payoutDetailsOf(db, c.get('user').id), 200))
    /** Replaces both details; an empty field clears it. */
    .put('/', zValidator('json', PayoutDetails), async (c) => {
      const userId = c.get('user').id;
      const details = c.req.valid('json');
      await db
        .insert(payoutDetails)
        .values({ userId, ...details })
        .onConflictDoUpdate({ target: payoutDetails.userId, set: { ...details, updatedAt: new Date() } });
      return c.json(details, 200);
    });

/**
 * A member's payout details ("Oddaj" sheet), mounted at
 * `/groups/:groupId/members/:memberId/payout-details`. Visible only to members
 * of a group shared with their owner: the caller must be in the group (404
 * otherwise, as for every group route). A member without an account has none.
 */
export const memberPayoutDetailsRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>().get('/', async (c) => {
    const { groupId, memberId } = c.req.param() as { groupId?: string; memberId?: string };
    const group = await findMyGroup(db, groupId, c.get('user').id);
    if (!group || !Id.safeParse(memberId).success) return c.json({ error: 'not_found' as const }, 404);
    const [member] = await db
      .select({ userId: members.userId })
      .from(members)
      .where(and(eq(members.id, memberId!), eq(members.groupId, group.id)));
    if (!member) return c.json({ error: 'not_found' as const }, 404);
    return c.json(member.userId ? await payoutDetailsOf(db, member.userId) : none, 200);
  });
