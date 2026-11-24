import type { CategoryStats, GroupStats, LocalDate } from '@split-pay/shared';

/**
 * A member's column, or the single "Poza grupą" column (`former`)
 * summing everyone who appears in the stats but is no longer a member.
 */
export type StatsColumn = { kind: 'member'; memberId: string; name: string } | { kind: 'former' };

export interface StatsCell {
  paid: number;
  consumed: number;
}

export interface StatsTable {
  columns: StatsColumn[];
  /** One row per day with entries; `cells` follow `columns`. */
  rows: { date: LocalDate; total: number; cells: StatsCell[] }[];
  /** The whole trip. */
  totals: { total: number; cells: StatsCell[] };
}

const ZERO: StatsCell = { paid: 0, consumed: 0 };

/**
 * The days × people table of the Stats screen: a column per member (Group
 * info order), then one for members who left, every cell filled.
 */
export function statsTable(
  stats: GroupStats,
  members: readonly { id: string; displayName: string }[],
): StatsTable {
  const columns: StatsColumn[] = members.map((m) => ({ kind: 'member', memberId: m.id, name: m.displayName }));
  const current = new Set(members.map((m) => m.id));
  if (stats.members.some((m) => !current.has(m.memberId))) columns.push({ kind: 'former' });
  const cells = (xs: GroupStats['members']) => {
    const byColumn = new Map<string | null, StatsCell>();
    for (const x of xs) {
      const key = current.has(x.memberId) ? x.memberId : null;
      const cell = byColumn.get(key) ?? { ...ZERO };
      byColumn.set(key, { paid: cell.paid + x.paid, consumed: cell.consumed + x.consumed });
    }
    return columns.map((c): StatsCell => byColumn.get(c.kind === 'member' ? c.memberId : null) ?? { ...ZERO });
  };
  return {
    columns,
    rows: stats.days.map((d) => ({ date: d.date, total: d.total, cells: cells(d.members) })),
    totals: { total: stats.total, cells: cells(stats.members) },
  };
}

/** Category breakdown bars: width relative to the largest category; net-income categories get no bar. */
export function categoryBars(categories: readonly CategoryStats[]) {
  const max = Math.max(0, ...categories.map((c) => c.amount));
  return categories.map((c) => ({ ...c, fraction: max > 0 && c.amount > 0 ? c.amount / max : 0 }));
}
