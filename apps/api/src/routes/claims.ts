import { randomBytes, randomUUID } from 'node:crypto';
import { Id } from '@split-pay/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { SessionUser } from '../auth';
import type { Db } from '../db/client';
import { claims, groupLinks, groups, memberClaimLinks, members } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import { type Tx, recordChange } from './change-log';

type ClaimRow = typeof claims.$inferSelect;
type GroupRow = typeof groups.$inferSelect;

/** 24 random bytes → 32 URL-safe characters. */
export const newLinkToken = () => randomBytes(24).toString('base64url');

/** The user's member in the group, if any. */
export async function findMyMember(db: Db, groupId: string, userId: string) {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.userId, userId)));
  return member;
}

/**
 * A claim as the API returns it — the system message "<claimerName> przejął
 * profil <memberName>". A `null` name was removed (ADR-0019): "Deleted user".
 */
const toClaimDto = (c: ClaimRow, memberName: string | null) => ({
  id: c.id,
  memberId: c.memberId,
  memberName,
  userId: c.userId,
  claimerName: c.claimerName,
  claimedAt: c.claimedAt.toISOString(),
  undoneAt: c.undoneAt?.toISOString() ?? null,
});

/**
 * What a link token opens: a group link (any member may be claimed, or join
 * as a new person) or a personal claim link (`claimFor` = the one member to
 * claim). Unknown and revoked tokens → undefined.
 */
export async function resolveLinkToken(
  db: Db,
  token: string,
): Promise<{ group: GroupRow; claimFor: string | null } | undefined> {
  const [shared] = await db
    .select({ group: groups })
    .from(groupLinks)
    .innerJoin(groups, eq(groups.id, groupLinks.groupId))
    .where(eq(groupLinks.token, token));
  if (shared) return { group: shared.group, claimFor: null };
  const [personal] = await db
    .select({ group: groups, memberId: memberClaimLinks.memberId })
    .from(memberClaimLinks)
    .innerJoin(groups, eq(groups.id, memberClaimLinks.groupId))
    .where(eq(memberClaimLinks.token, token));
  return personal ? { group: personal.group, claimFor: personal.memberId } : undefined;
}

/** Postgres unique violation (possibly wrapped by Drizzle). */
const isUniqueViolation = (error: unknown): boolean => {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
};

export type ClaimResult =
  | { status: 'claimed' | 'already_mine'; memberId: string }
  | { status: 'not_found' | 'already_claimed' | 'already_member' };

/**
 * Claims a member without an account of `groupId` for `user` (ADR-0007): the
 * member — with their whole history — now belongs to the account. A user is at
 * most one member of a group, so a user who already is one can't claim.
 */
export async function claimMember(
  db: Db,
  { groupId, memberId, user }: { groupId: string; memberId: string; user: Pick<SessionUser, 'id'> },
  claimerName: string,
): Promise<ClaimResult> {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
  if (!member) return { status: 'not_found' };
  if (member.userId === user.id) return { status: 'already_mine', memberId };
  if (member.userId !== null) return { status: 'already_claimed' };
  if (await findMyMember(db, groupId, user.id)) return { status: 'already_member' };

  try {
    const claimed = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(members)
        .set({ userId: user.id })
        .where(and(eq(members.id, memberId), isNull(members.userId)))
        .returning();
      if (!updated) return false;
      const claimId = randomUUID();
      await tx.insert(claims).values({ id: claimId, groupId, memberId, userId: user.id, claimerName });
      // The claim's change shares its id, so undoing the claim points at it either way.
      await recordChange(tx, {
        id: claimId,
        kind: 'claim',
        groupId,
        targetId: memberId,
        actorMemberId: memberId,
        before: null,
        after: { claimId },
      });
      return true;
    });
    if (claimed) return { status: 'claimed', memberId };
  } catch (error) {
    // The partial unique index (group_id, user_id): a concurrent join/claim made me a member.
    if (isUniqueViolation(error)) return { status: 'already_member' };
    throw error;
  }
  // Someone claimed it concurrently.
  const [now] = await db.select().from(members).where(eq(members.id, memberId));
  return now?.userId === user.id ? { status: 'already_mine', memberId } : { status: 'already_claimed' };
}

/**
 * Undoes a claim (inside the caller's transaction): the member is without an
 * account again — the claimer loses access unless they claim again — and a
 * `claim.undo` is recorded in the change history, pointing at the claim's
 * change (same id as the claim). Returns the updated claim, or `undefined`
 * when it was already undone (nothing changes).
 */
export async function undoClaim(tx: Tx, claim: ClaimRow, actorMemberId: string): Promise<ClaimRow | undefined> {
  const [row] = await tx
    .update(claims)
    .set({ undoneAt: new Date(), undoneByMemberId: actorMemberId })
    .where(and(eq(claims.id, claim.id), isNull(claims.undoneAt)))
    .returning();
  if (!row) return undefined;
  if (claim.userId) {
    await tx
      .update(members)
      .set({ userId: null })
      .where(and(eq(members.id, claim.memberId), eq(members.userId, claim.userId)));
  }
  await recordChange(tx, {
    kind: 'claim.undo',
    groupId: claim.groupId,
    targetId: claim.memberId,
    actorMemberId,
    undoesChangeId: claim.id,
    before: { claimId: claim.id },
    after: null,
  });
  return row;
}

/**
 * Claims of one group (system messages) and undoing them, mounted under
 * `/groups/:groupId/claims` by `groupsRoutes` (session required). Any member
 * may undo; for anyone else the group doesn't exist (404).
 */
export const claimRoutes = ({ db }: { db: Db }) => {
  async function myMember(groupId: string | undefined, userId: string) {
    if (!groupId || !Id.safeParse(groupId).success) return undefined;
    return findMyMember(db, groupId, userId);
  }

  return (
    new Hono<AuthEnv>()
      /** Every claim of the group, oldest first; undone ones have `undoneAt`. */
      .get('/', async (c) => {
        const me = await myMember(c.req.param('groupId'), c.get('user').id);
        if (!me) return c.json({ error: 'not_found' as const }, 404);
        const rows = await db
          .select({ claim: claims, memberName: members.displayName })
          .from(claims)
          .innerJoin(members, eq(members.id, claims.memberId))
          .where(eq(claims.groupId, me.groupId))
          .orderBy(asc(claims.claimedAt), asc(claims.id));
        return c.json(
          rows.map((r) => toClaimDto(r.claim, r.memberName)),
          200,
        );
      })
      /**
       * Undoes a claim: the member is without an account again (the claimer
       * loses access unless they claim again). Undoing an undone claim is a no-op.
       */
      .post('/:claimId/undo', async (c) => {
        const me = await myMember(c.req.param('groupId'), c.get('user').id);
        const claimId = c.req.param('claimId');
        if (!me || !Id.safeParse(claimId).success) return c.json({ error: 'not_found' as const }, 404);
        const [found] = await db
          .select({ claim: claims, memberName: members.displayName })
          .from(claims)
          .innerJoin(members, eq(members.id, claims.memberId))
          .where(and(eq(claims.id, claimId), eq(claims.groupId, me.groupId)));
        if (!found) return c.json({ error: 'not_found' as const }, 404);
        if (found.claim.undoneAt) return c.json(toClaimDto(found.claim, found.memberName), 200);

        const undone = await db.transaction(async (tx) => undoClaim(tx, found.claim, me.id));
        if (!undone) {
          // Undone concurrently.
          const [now] = await db.select().from(claims).where(eq(claims.id, claimId));
          return c.json(toClaimDto(now ?? found.claim, found.memberName), 200);
        }
        return c.json(toClaimDto(undone, found.memberName), 200);
      })
  );
};

/**
 * The personal claim link of a member without an account, mounted under
 * `/groups/:groupId/members/:memberId/claim-link` (session required). Any
 * member gets it; it's created on first use and stays the same.
 */
export const claimLinkRoutes = ({ db }: { db: Db }) =>
  new Hono<AuthEnv>().get('/', async (c) => {
    const { groupId, memberId } = c.req.param() as { groupId?: string; memberId?: string };
    if (!groupId || !memberId || !Id.safeParse(groupId).success || !Id.safeParse(memberId).success) {
      return c.json({ error: 'not_found' as const }, 404);
    }
    if (!(await findMyMember(db, groupId, c.get('user').id))) return c.json({ error: 'not_found' as const }, 404);
    const [member] = await db
      .select()
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
    if (!member) return c.json({ error: 'not_found' as const }, 404);
    if (member.userId !== null) return c.json({ error: 'has_account' as const }, 409);

    await db
      .insert(memberClaimLinks)
      .values({ memberId, groupId, token: newLinkToken() })
      .onConflictDoNothing({ target: memberClaimLinks.memberId });
    const [link] = await db.select().from(memberClaimLinks).where(eq(memberClaimLinks.memberId, memberId));
    if (!link) throw new Error(`claim link of ${memberId} vanished`);
    return c.json({ token: link.token }, 200);
  });
