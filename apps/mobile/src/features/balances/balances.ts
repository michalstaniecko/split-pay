import type { Allocation, Member, Transfer } from '@split-pay/shared';

/** What the balance banner says about my balance. `amount` is never negative. */
export interface BannerState {
  kind: 'owe' | 'owed' | 'settled';
  amount: number;
}

/** My balance for the banner: "do oddania", "należy ci się" or settled up. */
export function bannerState(data: { balances: readonly Allocation[] }, myMemberId: string | null): BannerState {
  const amount = data.balances.find((b) => b.memberId === myMemberId)?.amount ?? 0;
  if (amount < 0) return { kind: 'owe', amount: -amount };
  if (amount > 0) return { kind: 'owed', amount };
  return { kind: 'settled', amount: 0 };
}

export interface BalanceRow {
  memberId: string;
  name: string;
  amount: number;
  isMe: boolean;
}

export interface TransferRow extends Transfer {
  key: string;
  fromName: string;
  toName: string;
  /** `fromMe`: I pay ("Oddaj"); `toMe`: I'm paid; `others`: between other members. */
  direction: 'fromMe' | 'toMe' | 'others';
}

const directionOrder = { fromMe: 0, toMe: 1, others: 2 } as const;

/**
 * The balance drawer's rows: balances in the API's member order, transfers
 * with my own first (those I can act on), then those owed to me, then the rest.
 */
export function drawerRows(
  data: { balances: readonly Allocation[]; transfers: readonly Transfer[] },
  members: readonly { id: string; displayName: string }[],
  myMemberId: string | null,
): { balances: BalanceRow[]; transfers: TransferRow[] } {
  const name = (memberId: string) => members.find((m) => m.id === memberId)?.displayName ?? '?';
  const direction = (t: Transfer): TransferRow['direction'] =>
    t.from === myMemberId ? 'fromMe' : t.to === myMemberId ? 'toMe' : 'others';
  return {
    balances: data.balances.map((b) => ({
      memberId: b.memberId,
      name: name(b.memberId),
      amount: b.amount,
      isMe: b.memberId === myMemberId,
    })),
    transfers: data.transfers
      .map((t) => ({
        key: `${t.from}-${t.to}`,
        from: t.from,
        to: t.to,
        fromName: name(t.from),
        toName: name(t.to),
        amount: t.amount,
        direction: direction(t),
      }))
      // Stable sort: within a direction, the API's order is kept.
      .sort((a, b) => directionOrder[a.direction] - directionOrder[b.direction]),
  };
}
