import { z } from 'zod';

/**
 * A change of a group's settings (Group info → settings). Every field is
 * optional; only the given ones change. Later settings (base currency,
 * dates, …) add their fields here.
 */
export const GroupSettingsUpdate = z
  .object({
    /** Debt simplification: minimum number of transfers (default on). */
    simplifyDebts: z.boolean().optional(),
  })
  .strict();
export type GroupSettingsUpdate = z.infer<typeof GroupSettingsUpdate>;

/** What a group offers beyond entries, members and balances; screens hide what isn't available. */
export interface GroupActions {
  /** Group link and QR. */
  groupLink: boolean;
  /** Claiming a member, personal claim links and claim messages. */
  claiming: boolean;
  /** Change history and the links to it. */
  changeHistory: boolean;
  /** Archiving and unarchiving. */
  archiving: boolean;
  /** Trip dates and attendance. */
  tripDates: boolean;
  /** "Przypomnij" (nudging a debtor by push). */
  reminders: boolean;
  /** The group's push notification settings. */
  pushSettings: boolean;
  /** Members' payout details (bank account, BLIK). */
  payoutDetails: boolean;
  /** Receipt photos on entries. */
  receiptPhotos: boolean;
  /** Entries in another currency than the base one (rates come from the server, ADR-0014). */
  foreignCurrencies: boolean;
  /** Stats (computed by the server). */
  stats: boolean;
  /** Leaving the group. */
  leaving: boolean;
}

/**
 * The actions available in a group. A local group (ADR-0021) drops everything
 * that needs the server or other people; a synced group has them all (other
 * rules, like archiving or ownership, still apply on top).
 */
export function availableGroupActions(group: { local: boolean }): GroupActions {
  const synced = !group.local;
  return {
    groupLink: synced,
    claiming: synced,
    changeHistory: synced,
    archiving: synced,
    tripDates: synced,
    reminders: synced,
    pushSettings: synced,
    payoutDetails: synced,
    receiptPhotos: synced,
    foreignCurrencies: synced,
    stats: synced,
    leaving: synced,
  };
}
