import { allocate, type Allocation, splitEvenly } from './money';
import type { LocalDate, Member, Split } from './model';

/**
 * Wylicza udziały członków z trybu podziału, w walucie wpisu.
 * Suma wyniku zawsze równa się `amount`. Wynik posortowany po `memberId`.
 */
export function resolveSplit(split: Split, amount: number): Allocation[] {
  switch (split.mode) {
    case 'equal':
      return splitEvenly(amount, split.memberIds);
    case 'exact':
      return assertSum(mergeAllocations(split.amounts), amount);
    case 'shares':
      return allocate(amount, split.weights);
    case 'commonPlusPersonal': {
      const personal = mergeAllocations(split.personal);
      const common = amount - personal.reduce((acc, p) => acc + p.amount, 0);
      if (common < 0) throw new RangeError('Pozycje osobiste przekraczają kwotę wpisu');
      const shared = common === 0 ? [] : splitEvenly(common, split.commonMemberIds);
      return mergeAllocations([...personal, ...shared]);
    }
  }
}

/** Sumuje alokacje tego samego członka; wynik posortowany po `memberId`. */
export function mergeAllocations(allocations: readonly Allocation[]): Allocation[] {
  const byMember = new Map<string, number>();
  for (const a of allocations) byMember.set(a.memberId, (byMember.get(a.memberId) ?? 0) + a.amount);
  return [...byMember.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([memberId, amount]) => ({ memberId, amount }));
}

function assertSum(allocations: Allocation[], amount: number): Allocation[] {
  const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
  if (sum !== amount) throw new RangeError('Kwoty podziału nie sumują się do kwoty wpisu');
  return allocations;
}

/** Czy członek jest obecny danego dnia (obecność `null` = cały wyjazd). */
export function isPresentOn(member: Member, date: LocalDate): boolean {
  return member.attendance === null || (member.attendance.from <= date && date <= member.attendance.to);
}

/** Domyślni uczestnicy podziału: członkowie obecni w dniu wpisu. */
export function defaultParticipants(members: readonly Member[], date: LocalDate): Member['id'][] {
  return members.filter((m) => isPresentOn(m, date)).map((m) => m.id);
}
