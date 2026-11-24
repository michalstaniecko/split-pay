import {
  type Attendance,
  attendanceFromDays,
  type LocalDate,
  type Member,
  presentDays,
  type TripDates,
  tripDays,
} from '@split-pay/shared';

type TripMembers = TripDates & { members: readonly Pick<Member, 'id' | 'attendance'>[] };

/** The per-day attendance grid being edited: trip days × members, ticked days per member. */
export interface AttendanceGrid {
  days: LocalDate[];
  ticked: Readonly<Record<string, readonly LocalDate[]>>;
}

/** The grid as saved: every member's present trip days (`null` = all of them). */
export function attendanceGrid(group: TripMembers): AttendanceGrid {
  return {
    days: tripDays(group),
    ticked: Object.fromEntries(group.members.map((m) => [m.id, presentDays(m.attendance, group)])),
  };
}

export function isTicked(grid: AttendanceGrid, memberId: string, day: LocalDate): boolean {
  return grid.ticked[memberId]?.includes(day) ?? false;
}

export function toggleDay(grid: AttendanceGrid, memberId: string, day: LocalDate): AttendanceGrid {
  const current = grid.ticked[memberId] ?? [];
  const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
  return { ...grid, ticked: { ...grid.ticked, [memberId]: next } };
}

export type GridChanges =
  | { ok: true; changes: { memberId: string; attendance: Attendance | null }[] }
  | { ok: false; emptyMemberIds: string[] };

/**
 * What to save: the members whose trip days differ from the saved attendance,
 * in canonical form ("whole trip" = `null`). A member left without any day
 * can't be saved — zero days is not an attendance (ADR-0018).
 */
export function gridChanges(group: TripMembers, grid: AttendanceGrid): GridChanges {
  const saved = attendanceGrid(group);
  const changes: { memberId: string; attendance: Attendance | null }[] = [];
  const emptyMemberIds: string[] = [];
  for (const { id } of group.members) {
    const days = grid.ticked[id] ?? [];
    if (sameDays(days, saved.ticked[id] ?? [])) continue;
    const attendance = attendanceFromDays(days, group);
    if (attendance !== null && attendance.length === 0) emptyMemberIds.push(id);
    else changes.push({ memberId: id, attendance });
  }
  return emptyMemberIds.length > 0 ? { ok: false, emptyMemberIds } : { ok: true, changes };
}

function sameDays(a: readonly LocalDate[], b: readonly LocalDate[]): boolean {
  const set = new Set(a);
  return set.size === new Set(b).size && b.every((d) => set.has(d));
}

/** Column header of a trip day: short weekday and day/month in the UI language. */
export function dayLabel(date: LocalDate, locale: string): { weekday: string; day: string } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(year, month - 1, day));
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utc),
    day: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(utc),
  };
}
