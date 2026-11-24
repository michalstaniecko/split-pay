import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { groups, members } from './groups';

/**
 * Claim (GLOSSARY, ADR-0007): a user took over a member without an account.
 * Shown as a system message in the Conversation; any member may undo it
 * (`undoneAt`), which returns the member to "without an account". A later
 * claim of the same member is a new row.
 */
export const claims = pgTable(
  'claims',
  {
    id: uuid().primaryKey(),
    groupId: uuid()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    /** The claiming user; `null` once their account is deleted. */
    userId: uuid().references(() => user.id, { onDelete: 'set null' }),
    /**
     * The claimer's name at claim time ("Tomek przejął profil …"); `null` once
     * removed with their account (ADR-0019), shown as "Deleted user".
     */
    claimerName: text(),
    claimedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    undoneAt: timestamp({ withTimezone: true }),
    /** The member who undid the claim (no FK: it may be the claimed member itself). */
    undoneByMemberId: uuid(),
  },
  (t) => [index('claims_group_id_claimed_at_idx').on(t.groupId, t.claimedAt)],
);

/**
 * Personal claim link (GLOSSARY): a secret token pointing at one member
 * without an account. Opening it lands directly on claiming that member.
 * One per member, created on first use.
 */
export const memberClaimLinks = pgTable('member_claim_links', {
  memberId: uuid()
    .primaryKey()
    .references(() => members.id, { onDelete: 'cascade' }),
  groupId: uuid()
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  token: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
