import { allocate, type Allocation, convertAllocations, type CurrencyCode } from './money';
import type { Entry, LocalDate } from './model';
import { mergeAllocations, resolveSplit } from './split';

/**
 * Skutek wpisu w walucie bazowej grupy:
 * - `paid`: ile członek wyłożył (dla wpływu — ujemnie: ile otrzymał),
 * - `consumed`: ile członek skonsumował (dla wpływu — ujemnie: ile mu się należy).
 * Spłaty nie są ani wydawaniem, ani konsumpcją — patrz `entryBalanceDelta`.
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

/** Zmiana sald wywołana wpisem (dodatnie saldo = inni są winni temu członkowi). */
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

/** Salda członków w walucie bazowej. Suma sald zawsze wynosi 0. */
export function computeBalances(entries: readonly Entry[], baseCurrency: CurrencyCode): Map<string, number> {
  const balances = new Map<string, number>();
  for (const entry of entries.filter(isActive)) {
    for (const d of entryBalanceDelta(entry, baseCurrency)) {
      balances.set(d.memberId, (balances.get(d.memberId) ?? 0) + d.amount);
    }
  }
  return balances;
}

export interface MemberDayStats {
  /** Ile członek wyłożył tego dnia (wydatki minus otrzymane wpływy). */
  paid: number;
  /** Ile członek skonsumował tego dnia (udziały w wydatkach minus udziały we wpływach). */
  consumed: number;
}

/** Statystyki „dni × osoby” w walucie bazowej. Spłaty są pomijane. */
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
 * Rozliczenie uproszczone: minimalizuje liczbę przelewów, zachłannie łącząc
 * największego dłużnika z największym wierzycielem. Deterministyczne.
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
 * Rozliczenie bez upraszczania: każdy oddaje pieniądze tym, którzy faktycznie
 * za niego zapłacili (długi netto per para członków).
 */
export function pairwiseTransfers(entries: readonly Entry[], baseCurrency: CurrencyCode): Transfer[] {
  // debts[a][b] = ile a jest winien b
  const debts = new Map<string, Map<string, number>>();
  const addDebt = (debtor: string, creditor: string, amount: number) => {
    if (debtor === creditor || amount === 0) return;
    let row = debts.get(debtor);
    if (!row) debts.set(debtor, (row = new Map()));
    row.set(creditor, (row.get(creditor) ?? 0) + amount);
  };

  for (const entry of entries.filter(isActive)) {
    if (entry.kind === 'settlement') {
      // Spłata zmniejsza dług `from` wobec `to` — równoważnie: `to` jest winien `from`.
      const [delta] = entryBalanceDelta(entry, baseCurrency).filter((d) => d.memberId === entry.from);
      addDebt(entry.to, entry.from, delta!.amount);
      continue;
    }
    const { paid, consumed } = entryEffect(entry, baseCurrency);
    const sign = entry.kind === 'expense' ? 1 : -1;
    const holderWeights = paid.map((p) => ({ memberId: p.memberId, weight: Math.abs(p.amount) }));
    for (const c of consumed) {
      for (const part of allocate(Math.abs(c.amount), holderWeights)) {
        // wydatek: konsument → płatnik; wpływ: odbiorca → uczestnik
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
