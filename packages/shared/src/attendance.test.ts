import { describe, expect, it } from 'vitest';
import { attendanceFromDays, MemberAttendanceUpdate, presentDays, tripDays } from './attendance';

const trip = { startDate: '2026-07-10', endDate: '2026-07-14' };

describe('tripDays', () => {
  it('lists every day of the trip, both ends included', () => {
    expect(tripDays(trip)).toEqual(['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14']);
  });

  it('crosses month and year ends', () => {
    expect(tripDays({ startDate: '2026-12-30', endDate: '2027-01-02' })).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('is empty for a group without dates', () => {
    expect(tripDays({ startDate: null, endDate: null })).toEqual([]);
  });
});

describe('presentDays', () => {
  it('is every trip day for attendance null (whole trip)', () => {
    expect(presentDays(null, trip)).toEqual(tripDays(trip));
  });

  it('lists the trip days inside the ranges, clipping days outside the trip', () => {
    const attendance = [
      { from: '2026-07-01', to: '2026-07-10' },
      { from: '2026-07-13', to: '2026-07-20' },
    ];
    expect(presentDays(attendance, trip)).toEqual(['2026-07-10', '2026-07-13', '2026-07-14']);
  });
});

describe('attendanceFromDays', () => {
  it('maps every trip day ticked to null (whole trip)', () => {
    expect(attendanceFromDays(tripDays(trip), trip)).toBeNull();
  });

  it('turns ticked days into canonical ranges, gaps allowed (leave and come back)', () => {
    const days = ['2026-07-14', '2026-07-10', '2026-07-11', '2026-07-13', '2026-07-11'];
    expect(attendanceFromDays(days, trip)).toEqual([
      { from: '2026-07-10', to: '2026-07-11' },
      { from: '2026-07-13', to: '2026-07-14' },
    ]);
  });

  it('ignores days outside the trip', () => {
    expect(attendanceFromDays(['2026-07-09', '2026-07-12', '2026-07-15'], trip)).toEqual([
      { from: '2026-07-12', to: '2026-07-12' },
    ]);
  });

  it('gives an empty list when no day is ticked, which the schema rejects', () => {
    const none = attendanceFromDays([], trip);
    expect(none).toEqual([]);
    expect(MemberAttendanceUpdate.safeParse({ attendance: none }).success).toBe(false);
  });

  it('round-trips with presentDays', () => {
    const attendance = [
      { from: '2026-07-10', to: '2026-07-10' },
      { from: '2026-07-12', to: '2026-07-14' },
    ];
    expect(attendanceFromDays(presentDays(attendance, trip), trip)).toEqual(attendance);
  });
});

describe('MemberAttendanceUpdate', () => {
  it('accepts canonical attendance or null (whole trip)', () => {
    const attendance = [{ from: '2026-07-10', to: '2026-07-11' }];
    expect(MemberAttendanceUpdate.parse({ attendance })).toEqual({ attendance });
    expect(MemberAttendanceUpdate.parse({ attendance: null })).toEqual({ attendance: null });
  });

  it('rejects non-canonical attendance and a missing field', () => {
    const touching = [
      { from: '2026-07-10', to: '2026-07-11' },
      { from: '2026-07-12', to: '2026-07-14' },
    ];
    expect(MemberAttendanceUpdate.safeParse({ attendance: touching }).success).toBe(false);
    expect(MemberAttendanceUpdate.safeParse({}).success).toBe(false);
  });
});
