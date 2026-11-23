import { deletedUserName } from '@split-pay/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { OtpType } from '../auth';
import type { Db } from '../db/client';
import { changes, claims, members, user, verification } from '../db/schema';
import type { ObjectStorage } from '../storage/object-storage';
import { avatarPhotosOf, deletePhotos } from './photos';

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
 * Payout details, push tokens, notification settings and queued pushes go
 * with the `user` row (`onDelete: 'cascade'`). Avatars are deleted from the
 * bucket (#26); receipt photos the user took stay with the group's entries.
 * Future personal data must be removed here too, or cascade the same way.
 */
export async function deleteAccount(
  db: Db,
  account: { id: string; email: string },
  locale: string,
  storage?: ObjectStorage,
) {
  const name = deletedUserName(locale);
  const avatars = await avatarPhotosOf(db, account.id);
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
  // After the account is gone: if the bucket fails now, the retention job
  // removes these avatars later (their uploader is null).
  try {
    await deletePhotos(db, storage, avatars);
  } catch (error) {
    console.error('[photos] avatar deletion failed; the retention job retries', error);
  }
}
