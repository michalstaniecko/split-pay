import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { equalExpenseDefaults, NewQuickBill, QUICK_BILL_EMOJI } from '@split-pay/shared';
import { eq } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Db } from '../db/client';
import { groups, members } from '../db/schema';
import { recordChange } from './change-log';
import type { AuthEnv } from '../middleware/require-user';
import { createEntry } from './entries';
import { findMyGroup, toSharedGroup } from './group-access';
import { ownerDisplayName, toGroupDto } from './groups';

/** Thrown inside the transaction to roll it back. */
class QuickBillRejected extends Error {
  constructor(readonly status: 'conflict' | 'invalid') {
    super(status);
  }
}

/** Postgres unique violation: an id already used by someone else's row. */
const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && e.code === '23505';

/**
 * Quick bill (GLOSSARY): one request creates a group named after the title
 * (🧾, no dates), the caller as owner, a member without an account per person
 * and one expense paid by the caller, split equally among everyone. All in one
 * transaction. Idempotent on the client-generated group id: repeating it
 * answers 200 with the existing group; ids used by someone else → 409.
 */
export const quickBillsRoutes = ({ db, requireUser }: { db: Db; requireUser: MiddlewareHandler<AuthEnv> }) =>
  new Hono<AuthEnv>().use(requireUser).post('/', zValidator('json', NewQuickBill), async (c) => {
    const input = c.req.valid('json');
    const user = c.get('user');
    try {
      const group = await db.transaction(async (tx) => {
        const ownerMemberId = randomUUID();
        const [group] = await tx
          .insert(groups)
          .values({
            id: input.groupId,
            name: input.title,
            emoji: QUICK_BILL_EMOJI,
            color: input.color,
            baseCurrency: input.currency,
            startDate: null,
            endDate: null,
            ownerMemberId,
          })
          .onConflictDoNothing({ target: groups.id })
          .returning();
        if (!group) return undefined;
        // Members are listed by creation time: owner first, then the people in the order they were entered.
        const at = (i: number) => new Date(group.createdAt.getTime() + i);
        const groupMembers = await tx
          .insert(members)
          .values([
            { id: ownerMemberId, groupId: group.id, displayName: ownerDisplayName(user), userId: user.id, createdAt: at(0) },
            ...input.people.map((p, i) => ({ id: p.id, groupId: group.id, displayName: p.displayName, createdAt: at(i + 1) })),
          ])
          .returning();
        await recordChange(tx, {
          kind: 'group.create',
          groupId: group.id,
          targetId: group.id,
          actorMemberId: ownerMemberId,
          before: null,
          after: { name: group.name, emoji: group.emoji },
        });
        for (const person of input.people) {
          await recordChange(tx, {
            kind: 'member.add',
            groupId: group.id,
            targetId: person.id,
            actorMemberId: ownerMemberId,
            before: null,
            after: { displayName: person.displayName },
          });
        }
        const expense = equalExpenseDefaults({
          id: input.expenseId,
          title: input.title,
          amount: input.amount,
          currency: input.currency,
          date: input.date,
          payerMemberId: ownerMemberId,
          members: groupMembers,
        });
        const result = await createEntry(tx, expense, {
          group: toSharedGroup(group),
          members: groupMembers,
          userId: user.id,
        });
        if (result.status === 'conflict' || result.status === 'existing') throw new QuickBillRejected('conflict');
        if (result.status === 'invalid') throw new QuickBillRejected('invalid');
        // createEntry bumped lastActivityAt; return the fresh row.
        const [fresh] = await tx.select().from(groups).where(eq(groups.id, group.id));
        return fresh ?? group;
      });
      if (group) return c.json({ group: toGroupDto(group) }, 201);
    } catch (e) {
      if (e instanceof QuickBillRejected && e.status === 'invalid') return c.json({ error: 'invalid' as const }, 400);
      if (!(e instanceof QuickBillRejected) && !isUniqueViolation(e)) throw e;
      return c.json({ error: 'conflict' as const }, 409);
    }

    const existing = await findMyGroup(db, input.groupId, user.id);
    if (!existing) return c.json({ error: 'conflict' as const }, 409);
    return c.json({ group: toGroupDto(existing) }, 200);
  });
