import { computeBalances, pairwiseTransfers, simplifiedTransfers, type Transfer } from './ledger';
import type { Entry } from './model';
import type { Allocation, CurrencyCode } from './money';

/** A group's balances and the suggested transfers that bring them to zero (the balance drawer). */
export interface SettleUp {
  /** Every member's balance in the base currency (positive = others owe them), in the given member order. */
  balances: Allocation[];
  /** The settle-up: simplified when the group simplifies debts, pairwise otherwise. */
  transfers: Transfer[];
}

/**
 * Balances and settle-up of a group, in its base currency. Members without
 * any entry get a 0 balance; deleted entries are skipped.
 */
export function settleUp(
  entries: readonly Entry[],
  group: { baseCurrency: CurrencyCode; simplifyDebts: boolean },
  memberIds: readonly string[],
): SettleUp {
  const computed = computeBalances(entries, group.baseCurrency);
  const ids = [...memberIds, ...[...computed.keys()].filter((id) => !memberIds.includes(id))];
  return {
    balances: ids.map((memberId) => ({ memberId, amount: computed.get(memberId) ?? 0 })),
    transfers: group.simplifyDebts
      ? simplifiedTransfers(computed)
      : pairwiseTransfers(entries, group.baseCurrency),
  };
}
