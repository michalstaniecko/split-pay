import { allocate, type Allocation, convertAllocations, type CurrencyCode } from './money';
import type { Entry, LocalDate } from './model';
import { mergeAllocations, resolveSplit } from './split';

/**
 * Effect of an entry in the group's base currency:
 * - `paid`: how much the member paid out (for income — negative: how much they received),
 * - `consumed`: how much the member consumed (for income — negative: how much they are owed).
 * Settlements are neither spending nor consumption — see `entryBalanceDelta`.
 */
export interface EntryEffect {
  paid: Allocation[];
  consumed: Allocation[];
}

const negate = (xs: Allocation[]) => xs.map((x) => ({ memberId: x.memberId, amount: -x.amount || 0 }));

export function entryEffect(entry: Entry, baseCurrency: CurrencyCode): EntryEffect {
  if (entry.kind === 'settlement') return { paid: [], consumed: [] };
  const holders = entry.kind === 'expense' ? entry.payers : entry.recipients;
  const toBase = (xs: readonly Allocation[]) =>
    convertAllocations(mergeAllocations(xs), entry.rateToBase, entry.currency, baseCurrency);
  const paid = toBase(holders);
  const consumed = toBase(resolveSplit(entry.split, entry.amount));
  return entry.kind === 'expense' ? { paid, consumed } : { paid: negate(paid), consumed: negate(consumed) };
}

/** Balance change caused by an entry (positive balance = others owe this member). */
export function entryBalanceDelta(entry: Entry, baseCurrency: CurrencyCode): Allocation[] {
  if (entry.kind === 'settlement') {
    const [converted] = convertAllocations(
      [{ memberId: entry.from, amount: entry.amount }],
      entry.rateToBase,
      entry.currency,
      baseCurrency,
    );
    const amount = converted!.amount;
    return mergeAllocations([
      { memberId: entry.from, amount },
      { memberId: entry.to, amount: -amount },
    ]);
  }
  const { paid, consumed } = entryEffect(entry, baseCurrency);
  return mergeAllocations([...paid, ...negate(consumed)]);
}

const isActive = (entry: Entry) => entry.deletedAt === null;

/** Members' balances in the base currency. Balances always sum to 0. */
export function computeBalances(entries: readonly Entry[], baseCurrency: CurrencyCode): Map<string, number> {
  const balances = new Map<string, number>();
  for (const entry of entries.filter(isActive)) {
    for (const d of entryBalanceDelta(entry, baseCurrency)) {
      balances.set(d.memberId, (balances.get(d.memberId) ?? 0) + d.amount);
    }
  }
  return balances;
}

/**
 * A member's share of an entry in the base currency ("twój udział" on a
 * bubble): 0 when they are not in the split and for settlements, negative for
 * an income (money that belongs to them).
 */
export function memberShare(entry: Entry, memberId: string, baseCurrency: CurrencyCode): number {
  return entryEffect(entry, baseCurrency).consumed.find((c) => c.memberId === memberId)?.amount ?? 0;
}

/**
 * The group's spending per day in the base currency (the Conversation's day
 * separators): the sum of that day's expenses. Incomes and settlements are
 * not spending and are skipped, as are deleted entries. Days without
 * expenses are absent.
 */
export function dailyTotals(entries: readonly Entry[], baseCurrency: CurrencyCode): Map<LocalDate, number> {
  const totals = new Map<LocalDate, number>();
  for (const entry of entries.filter(isActive)) {
    if (entry.kind !== 'expense') continue;
    // Converted as a total, then split — so the sum of shares is the converted amount (ADR-0016).
    const amount = entryEffect(entry, baseCurrency).consumed.reduce((acc, c) => acc + c.amount, 0);
    totals.set(entry.date, (totals.get(entry.date) ?? 0) + amount);
  }
  return totals;
}

export interface MemberDayStats {
  /** How much the member paid out that day (expenses minus income received). */
  paid: number;
  /** How much the member consumed that day (expense shares minus income shares). */
  consumed: number;
}

/** "Days × people" statistics in the base currency. Settlements are skipped. */
export function dailyStats(
  entries: readonly Entry[],
  baseCurrency: CurrencyCode,
): Map<LocalDate, Map<string, MemberDayStats>> {
  const days = new Map<LocalDate, Map<string, MemberDayStats>>();
  const bucket = (date: LocalDate, memberId: string) => {
    let day = days.get(date);
    if (!day) days.set(date, (day = new Map()));
    let stats = day.get(memberId);
    if (!stats) day.set(memberId, (stats = { paid: 0, consumed: 0 }));
    return stats;
  };
  for (const entry of entries.filter(isActive)) {
    if (entry.kind === 'settlement') continue;
    const { paid, consumed } = entryEffect(entry, baseCurrency);
    for (const p of paid) bucket(entry.date, p.memberId).paid += p.amount;
    for (const c of consumed) bucket(entry.date, c.memberId).consumed += c.amount;
  }
  return new Map([...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

const byAmountDescThenId = (a: Allocation, b: Allocation) =>
  b.amount - a.amount || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0);

/**
 * Simplified settle-up: minimizes the number of transfers by greedily matching
 * the largest debtor with the largest creditor. Deterministic.
 */
export function simplifiedTransfers(balances: ReadonlyMap<string, number>): Transfer[] {
  const creditors: Allocation[] = [];
  const debtors: Allocation[] = [];
  for (const [memberId, amount] of balances) {
    if (amount > 0) creditors.push({ memberId, amount });
    if (amount < 0) debtors.push({ memberId, amount: -amount });
  }
  const transfers: Transfer[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmountDescThenId);
    debtors.sort(byAmountDescThenId);
    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.amount, debtor.amount);
    transfers.push({ from: debtor.memberId, to: creditor.memberId, amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditors.shift();
    if (debtor.amount === 0) debtors.shift();
  }
  return transfers;
}

/**
 * Settle-up without simplification: everyone pays back those who actually
 * paid for them (net debts per pair of members).
 */
export function pairwiseTransfers(entries: readonly Entry[], baseCurrency: CurrencyCode): Transfer[] {
  // debts[a][b] = how much a owes b
  const debts = new Map<string, Map<string, number>>();
  const addDebt = (debtor: string, creditor: string, amount: number) => {
    if (debtor === creditor || amount === 0) return;
    let row = debts.get(debtor);
    if (!row) debts.set(debtor, (row = new Map()));
    row.set(creditor, (row.get(creditor) ?? 0) + amount);
  };

  for (const entry of entries.filter(isActive)) {
    if (entry.kind === 'settlement') {
      // A settlement reduces what `from` owes `to` — equivalently: `to` owes `from`.
      const [delta] = entryBalanceDelta(entry, baseCurrency).filter((d) => d.memberId === entry.from);
      addDebt(entry.to, entry.from, delta!.amount);
      continue;
    }
    const { paid, consumed } = entryEffect(entry, baseCurrency);
    const sign = entry.kind === 'expense' ? 1 : -1;
    const holderWeights = paid.map((p) => ({ memberId: p.memberId, weight: Math.abs(p.amount) }));
    for (const c of consumed) {
      for (const part of allocate(Math.abs(c.amount), holderWeights)) {
        // expense: consumer → payer; income: recipient → participant
        if (sign > 0) addDebt(c.memberId, part.memberId, part.amount);
        else addDebt(part.memberId, c.memberId, part.amount);
      }
    }
  }

  const transfers: Transfer[] = [];
  const members = [...new Set([...debts.keys(), ...[...debts.values()].flatMap((r) => [...r.keys()])])].sort();
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!;
      const b = members[j]!;
      const net = (debts.get(a)?.get(b) ?? 0) - (debts.get(b)?.get(a) ?? 0);
      if (net > 0) transfers.push({ from: a, to: b, amount: net });
      if (net < 0) transfers.push({ from: b, to: a, amount: -net });
    }
  }
  return transfers;
}
