import { z } from 'zod';
import { Attendance, type AttendanceRange, type LocalDate, nextDay, normalizeAttendance } from './model';

/**
 * The per-day attendance grid of a trip (Group info) and its mapping to the
 * canonical attendance form (ADR-0018).
 */

/** The trip's dates; a group without dates is not a trip. */
export interface TripDates {
  startDate: LocalDate | null;
  endDate: LocalDate | null;
}

/** Every day of the trip, both ends included; empty for a group without dates. */
export function tripDays({ startDate, endDate }: TripDates): LocalDate[] {
  if (startDate === null || endDate === null) return [];
  const days: LocalDate[] = [];
  for (let day = startDate; day <= endDate; day = nextDay(day)) days.push(day);
  return days;
}

/** The trip days a member is present on (`null` = whole trip). Days outside the trip are clipped. */
export function presentDays(attendance: Attendance | null, trip: TripDates): LocalDate[] {
  const days = tripDays(trip);
  if (attendance === null) return days;
  return days.filter((day) => attendance.some((r) => r.from <= day && day <= r.to));
}

/**
 * Attendance from the days ticked in the grid: `null` when every trip day is
 * ticked ("whole trip"), else canonical ranges (gaps allowed). Days outside
 * the trip are ignored. No day ticked gives an empty list — not a valid
 * attendance, so the UI must not save it.
 */
export function attendanceFromDays(days: Iterable<LocalDate>, trip: TripDates): AttendanceRange[] | null {
  const all = tripDays(trip);
  const ticked = new Set(days);
  const present = all.filter((day) => ticked.has(day));
  if (present.length === all.length && all.length > 0) return null;
  return normalizeAttendance(present.map((day) => ({ from: day, to: day })));
}

/** Setting a member's attendance (`null` = whole trip). Only the canonical form is accepted. */
export const MemberAttendanceUpdate = z.object({ attendance: Attendance.nullable() });
export type MemberAttendanceUpdate = z.infer<typeof MemberAttendanceUpdate>;
