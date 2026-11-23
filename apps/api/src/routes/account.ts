import { deletedUserName } from '@split-pay/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { OtpType } from '../auth';
import type { Db } from '../db/client';
import { changes, claims, members, user, verification } from '../db/schema';

const otpTypes: readonly OtpType[] = ['sign-in', 'email-verification', 'forget-password', 'change-email'];

/**
 * Deletes a user's account (ADR-0010). Personal data goes: the `user` row
 * (email, name, avatar) and with it sessions and sign-in accounts (FK
 * cascade), pending one-time codes, the claimer name on claims they made, their
 * member names in the change history.
 * In every group their member stays, as an ordinary member without an account
 * named "Usunięty użytkownik" in `locale` — entries reference member ids, so
 * expenses and balances are untouched. Anyone can rename or claim it later.
 *
 * Future personal data (payout details, push tokens, avatars in storage) must
 * be removed here too, or reference `user` with `onDelete: 'cascade'`.
 */
export async function deleteAccount(db: Db, account: { id: string; email: string }, locale: string) {
  const name = deletedUserName(locale);
  await db.transaction(async (tx) => {
    // Names their members had (added, joined, renamed) in the change history.
    const named = (column: typeof changes.before | typeof changes.after) =>
      sql`case when ${column} is null then null else jsonb_build_object('displayName', ${name}::text) end`;
    await tx
      .update(changes)
      .set({ before: named(changes.before), after: named(changes.after) })
      .where(
        and(
          inArray(changes.kind, ['member.add', 'member.join', 'member.rename']),
          inArray(changes.targetId, tx.select({ id: members.id }).from(members).where(eq(members.userId, account.id))),
        ),
      );
    await tx.update(members).set({ userId: null, displayName: name }).where(eq(members.userId, account.id));
    await tx.update(claims).set({ userId: null, claimerName: name }).where(eq(claims.userId, account.id));
    await tx.delete(verification).where(
      inArray(
        verification.identifier,
        otpTypes.map((type) => `${type}-otp-${account.email}`),
      ),
    );
    await tx.delete(user).where(eq(user.id, account.id));
  });
}
