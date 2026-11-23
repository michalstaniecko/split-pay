import type { CategoryStats, GroupStats, LocalDate } from '@split-pay/shared';

export interface StatsColumn {
  memberId: string;
  /** `null` for someone who appears in the stats but is no longer a member. */
  name: string | null;
}

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
 * info order, then any id found only in the stats), every cell filled.
 */
export function statsTable(
  stats: GroupStats,
  members: readonly { id: string; displayName: string }[],
): StatsTable {
  const columns: StatsColumn[] = members.map((m) => ({ memberId: m.id, name: m.displayName }));
  const known = new Set(columns.map((c) => c.memberId));
  for (const m of stats.members) {
    if (!known.has(m.memberId)) {
      known.add(m.memberId);
      columns.push({ memberId: m.memberId, name: null });
    }
  }
  const cells = (xs: GroupStats['members']) => {
    const byId = new Map(xs.map((x) => [x.memberId, x]));
    return columns.map((c): StatsCell => {
      const x = byId.get(c.memberId);
      return x ? { paid: x.paid, consumed: x.consumed } : { ...ZERO };
    });
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
