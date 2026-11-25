import type { AccountDeletion } from '@split-pay/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { OtpType } from '../otp-email/message';
import type { Db } from '../db/client';
import { changes, claims, members, user, verification } from '../db/schema';
import type { ObjectStorage } from '../storage/object-storage';
import { avatarPhotosOf, deletePhotos } from './photos';

const otpTypes: readonly OtpType[] = ['sign-in', 'email-verification', 'forget-password', 'change-email'];

/**
 * Deletes a user's account (ADR-0010, ADR-0019). Personal data goes: the
 * `user` row (email, name, avatar) and with it sessions and sign-in accounts
 * (FK cascade), and pending one-time codes.
 * In every group their member stays, as an ordinary member without an account
 * — entries reference member ids (and `createdByMember` for "added by"), so
 * expenses, balances and authorship are untouched. Anyone can rename or claim
 * it later. By default it keeps its last name. With `removeName` the name is
 * cleared everywhere it is stored — the members, the claimer name on claims
 * they made, their member names in the change history — leaving the marker
 * `null`, which every viewer shows as "Deleted user" in their own language.
 *
 * Payout details, push tokens, notification settings and queued pushes go
 * with the `user` row (`onDelete: 'cascade'`). Avatars are always deleted
 * from the bucket (#26); receipt photos the user took stay with the group's
 * entries. Future personal data must be removed here too, or cascade the same way.
 */
export async function deleteAccount(
  db: Db,
  account: { id: string; email: string },
  { removeName }: AccountDeletion,
  storage?: ObjectStorage,
) {
  const avatars = await avatarPhotosOf(db, account.id);
  await db.transaction(async (tx) => {
    const myMembers = tx.select({ id: members.id }).from(members).where(eq(members.userId, account.id));
    if (removeName) {
      // Names their members had (added, joined, renamed) in the change history.
      const named = (column: typeof changes.before | typeof changes.after) =>
        sql`case when ${column} is null then null else jsonb_build_object('displayName', null) end`;
      await tx
        .update(changes)
        .set({ before: named(changes.before), after: named(changes.after) })
        .where(and(inArray(changes.kind, ['member.add', 'member.join', 'member.rename']), inArray(changes.targetId, myMembers)));
      await tx.update(claims).set({ claimerName: null }).where(eq(claims.userId, account.id));
    }
    await tx
      .update(members)
      .set(removeName ? { userId: null, displayName: null } : { userId: null })
      .where(eq(members.userId, account.id));
    await tx.update(claims).set({ userId: null }).where(eq(claims.userId, account.id));
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
