import { allocate, type Allocation, splitEvenly } from './money';
import type { LocalDate, Member, Split } from './model';

/**
 * Derives members' shares from a split mode, in the entry currency.
 * The result always adds up to `amount` and is sorted by `memberId`.
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
      if (common < 0) throw new RangeError('Personal items exceed the entry amount');
      const shared = common === 0 ? [] : splitEvenly(common, split.commonMemberIds);
      return mergeAllocations([...personal, ...shared]);
    }
  }
}

/** Sums allocations of the same member; the result is sorted by `memberId`. */
export function mergeAllocations(allocations: readonly Allocation[]): Allocation[] {
  const byMember = new Map<string, number>();
  for (const a of allocations) byMember.set(a.memberId, (byMember.get(a.memberId) ?? 0) + a.amount);
  return [...byMember.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([memberId, amount]) => ({ memberId, amount }));
}

function assertSum(allocations: Allocation[], amount: number): Allocation[] {
  const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
  if (sum !== amount) throw new RangeError('Split amounts do not add up to the entry amount');
  return allocations;
}

/** Whether a member is present on a given day (attendance `null` = whole trip). */
export function isPresentOn(member: Member, date: LocalDate): boolean {
  return member.attendance === null || (member.attendance.from <= date && date <= member.attendance.to);
}

/** Default split participants: members present on the entry's date. */
export function defaultParticipants(members: readonly Member[], date: LocalDate): Member['id'][] {
  return members.filter((m) => isPresentOn(m, date)).map((m) => m.id);
}
