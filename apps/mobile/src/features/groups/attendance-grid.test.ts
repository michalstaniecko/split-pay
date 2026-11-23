import { describe, expect, it } from 'vitest';
import { attendanceGrid, dayLabel, gridChanges, isTicked, toggleDay } from './attendance-grid';

const ANIA = '00000000-0000-4000-8000-000000000001';
const TOMEK = '00000000-0000-4000-8000-000000000002';

const trip = {
  startDate: '2026-07-10',
  endDate: '2026-07-12',
  members: [
    { id: ANIA, attendance: null },
    { id: TOMEK, attendance: [{ from: '2026-07-11', to: '2026-07-11' }] },
  ],
};

describe('attendance grid', () => {
  it('starts from the saved attendance', () => {
    const grid = attendanceGrid(trip);
    expect(grid.days).toEqual(['2026-07-10', '2026-07-11', '2026-07-12']);
    expect(isTicked(grid, ANIA, '2026-07-10')).toBe(true);
    expect(isTicked(grid, TOMEK, '2026-07-10')).toBe(false);
    expect(isTicked(grid, TOMEK, '2026-07-11')).toBe(true);
    expect(gridChanges(trip, grid)).toEqual({ ok: true, changes: [] });
  });

  it('saves only changed members, gaps as canonical ranges', () => {
    let grid = attendanceGrid(trip);
    grid = toggleDay(grid, ANIA, '2026-07-11');
    expect(isTicked(grid, ANIA, '2026-07-11')).toBe(false);
    expect(gridChanges(trip, grid)).toEqual({
      ok: true,
      changes: [
        {
          memberId: ANIA,
          attendance: [
            { from: '2026-07-10', to: '2026-07-10' },
            { from: '2026-07-12', to: '2026-07-12' },
          ],
        },
      ],
    });
  });

  it('saves every day ticked as the whole trip (null)', () => {
    let grid = attendanceGrid(trip);
    grid = toggleDay(grid, TOMEK, '2026-07-10');
    grid = toggleDay(grid, TOMEK, '2026-07-12');
    expect(gridChanges(trip, grid)).toEqual({ ok: true, changes: [{ memberId: TOMEK, attendance: null }] });
  });

  it('toggling a day back restores the saved state (no change)', () => {
    const grid = toggleDay(toggleDay(attendanceGrid(trip), ANIA, '2026-07-12'), ANIA, '2026-07-12');
    expect(gridChanges(trip, grid)).toEqual({ ok: true, changes: [] });
  });

  it('refuses to save a member without any day', () => {
    const grid = toggleDay(attendanceGrid(trip), TOMEK, '2026-07-11');
    expect(gridChanges(trip, grid)).toEqual({ ok: false, emptyMemberIds: [TOMEK] });
  });

  it('keeps attendance with days outside the trip unchanged when its trip days are untouched', () => {
    const outside = {
      ...trip,
      members: [{ id: TOMEK, attendance: [{ from: '2026-07-01', to: '2026-07-11' }] }],
    };
    expect(gridChanges(outside, attendanceGrid(outside))).toEqual({ ok: true, changes: [] });
  });
});

describe('dayLabel', () => {
  it('gives a short weekday and day.month in the UI language', () => {
    expect(dayLabel('2026-07-10', 'en')).toEqual({ weekday: 'Fri', day: '7/10' });
    expect(dayLabel('2026-07-10', 'pl')).toEqual({ weekday: 'pt.', day: '10.07' });
  });
});
