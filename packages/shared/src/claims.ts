import { z } from 'zod';
import { Id, type Member } from './model';

/** Claim (GLOSSARY, ADR-0007): which member without an account the user claims. */
export const ClaimMember = z.object({ memberId: Id });
export type ClaimMember = z.infer<typeof ClaimMember>;

/** The members a user can claim: members without an account, in the given order. */
export function claimableMembers<M extends Pick<Member, 'userId'>>(members: readonly M[]): M[] {
  return members.filter((m) => m.userId === null);
}
