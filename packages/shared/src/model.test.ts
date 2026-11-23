import { describe, expect, it } from 'vitest';
import {
  type AttendanceRange,
  canRenameMember,
  Entry,
  Group,
  Member,
  MemberRename,
  NewGroup,
  NewMember,
  normalizeAttendance,
  validateEntryInGroup,
} from './model';
import { ANIA, BARTEK, KASIA, TOMEK, USER, expense, group, member, members, settlement, uuid } from './test-fixtures';

describe('Entry', () => {
  const valid = expense({
    amount: 10_000,
    payers: [{ memberId: ANIA, amount: 10_000 }],
    split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
  });

  it('accepts a valid expense', () => {
    expect(Entry.safeParse(valid).success).toBe(true);
  });

  it('rejects payers not adding up to the amount', () => {
    const r = Entry.safeParse({ ...valid, payers: [{ memberId: ANIA, amount: 9_000 }] });
    expect(r.success).toBe(false);
  });

  it('rejects an exact split not adding up to the amount', () => {
    const r = Entry.safeParse({
      ...valid,
      split: { mode: 'exact', amounts: [{ memberId: ANIA, amount: 5_000 }] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects personal items larger than the amount', () => {
    const r = Entry.safeParse({
      ...valid,
      split: { mode: 'commonPlusPersonal', commonMemberIds: [ANIA], personal: [{ memberId: BARTEK, amount: 20_000 }] },
    });
    expect(r.success).toBe(false);
  });

  it('requires common members when a remainder is left', () => {
    const r = Entry.safeParse({
      ...valid,
      split: { mode: 'commonPlusPersonal', commonMemberIds: [], personal: [{ memberId: BARTEK, amount: 2_000 }] },
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer and negative amounts', () => {
    expect(Entry.safeParse({ ...valid, amount: 100.5 }).success).toBe(false);
    expect(Entry.safeParse({ ...valid, amount: -100 }).success).toBe(false);
  });

  it('rejects a settlement to oneself', () => {
    expect(Entry.safeParse(settlement({ amount: 100, from: ANIA, to: ANIA })).success).toBe(false);
  });

  it('rejects comma-formatted, negative and zero rates', () => {
    expect(Entry.safeParse({ ...valid, rateToBase: '4,27' }).success).toBe(false);
    expect(Entry.safeParse({ ...valid, rateToBase: '-1' }).success).toBe(false);
    expect(Entry.safeParse({ ...valid, rateToBase: '0.0' }).success).toBe(false);
  });
});

describe('Group', () => {
  it('requires both dates or neither', () => {
    expect(Group.safeParse(group).success).toBe(true);
    expect(Group.safeParse({ ...group, startDate: null, endDate: null }).success).toBe(true);
    expect(Group.safeParse({ ...group, endDate: null }).success).toBe(false);
    expect(Group.safeParse({ ...group, startDate: '2026-07-20' }).success).toBe(false);
  });
});

describe('NewGroup', () => {
  const trip = {
    id: uuid(90),
    name: 'Mazury',
    emoji: '⛵',
    color: '#1E88E5',
    baseCurrency: 'PLN',
    startDate: '2026-07-10',
    endDate: '2026-07-14',
  };

  it('accepts what the create-group form sends, with or without dates', () => {
    expect(NewGroup.safeParse(trip).success).toBe(true);
    expect(NewGroup.safeParse({ ...trip, startDate: null, endDate: null }).success).toBe(true);
  });

  it('applies the Group rules: both dates or neither, start not after end, non-blank name', () => {
    expect(NewGroup.safeParse({ ...trip, endDate: null }).success).toBe(false);
    expect(NewGroup.safeParse({ ...trip, startDate: '2026-07-15' }).success).toBe(false);
    expect(NewGroup.safeParse({ ...trip, name: '   ' }).success).toBe(false);
    expect(NewGroup.safeParse({ ...trip, color: 'blue' }).success).toBe(false);
    expect(NewGroup.safeParse({ ...trip, baseCurrency: 'pln' }).success).toBe(false);
  });

  it('accepts a one-day trip', () => {
    expect(NewGroup.safeParse({ ...trip, endDate: trip.startDate }).success).toBe(true);
  });

  it('trims the name and drops fields the server decides (settings, archiving)', () => {
    const parsed = NewGroup.parse({ ...trip, name: '  Mazury ', simplifyDebts: false, archivedAt: '2026-01-01T00:00:00Z' });
    expect(parsed).toEqual({ ...trip, name: 'Mazury' });
  });
});

describe('Member', () => {
  const withAttendance = (attendance: unknown) => Member.safeParse({ ...member(ANIA, 'Ania'), attendance });

  it('accepts no attendance (whole trip) and canonical lists of ranges', () => {
    expect(withAttendance(null).success).toBe(true);
    expect(withAttendance([{ from: '2026-07-10', to: '2026-07-10' }]).success).toBe(true);
    expect(
      withAttendance([
        { from: '2026-07-10', to: '2026-07-11' },
        { from: '2026-07-13', to: '2026-07-14' },
      ]).success,
    ).toBe(true);
  });

  it('rejects an empty attendance list', () => {
    expect(withAttendance([]).success).toBe(false);
  });

  it('rejects a range that starts after it ends', () => {
    expect(withAttendance([{ from: '2026-07-12', to: '2026-07-11' }]).success).toBe(false);
  });

  it('rejects unsorted ranges', () => {
    expect(
      withAttendance([
        { from: '2026-07-13', to: '2026-07-14' },
        { from: '2026-07-10', to: '2026-07-11' },
      ]).success,
    ).toBe(false);
  });

  it('rejects overlapping ranges', () => {
    expect(
      withAttendance([
        { from: '2026-07-10', to: '2026-07-12' },
        { from: '2026-07-12', to: '2026-07-14' },
      ]).success,
    ).toBe(false);
  });

  it('rejects touching ranges', () => {
    expect(
      withAttendance([
        { from: '2026-07-10', to: '2026-07-11' },
        { from: '2026-07-12', to: '2026-07-14' },
      ]).success,
    ).toBe(false);
    expect(
      withAttendance([
        { from: '2026-07-30', to: '2026-07-31' },
        { from: '2026-08-01', to: '2026-08-02' },
      ]).success,
    ).toBe(false);
  });

  it('does not check attendance against the trip dates', () => {
    expect(withAttendance([{ from: '2025-01-01', to: '2027-12-31' }]).success).toBe(true);
  });
});

describe('NewMember', () => {
  it('takes a client-generated id and a trimmed name; attendance is optional', () => {
    expect(NewMember.parse({ id: ANIA, displayName: '  Tomek ' })).toEqual({ id: ANIA, displayName: 'Tomek' });
    const attendance = [{ from: '2026-07-10', to: '2026-07-11' }];
    expect(NewMember.parse({ id: ANIA, displayName: 'Tomek', attendance })).toEqual({
      id: ANIA,
      displayName: 'Tomek',
      attendance,
    });
  });

  it('rejects a blank or too long name and non-canonical attendance', () => {
    expect(NewMember.safeParse({ id: ANIA, displayName: '   ' }).success).toBe(false);
    expect(NewMember.safeParse({ id: ANIA, displayName: 'x'.repeat(61) }).success).toBe(false);
    expect(NewMember.safeParse({ id: 'nope', displayName: 'Tomek' }).success).toBe(false);
    const touching = [
      { from: '2026-07-10', to: '2026-07-11' },
      { from: '2026-07-12', to: '2026-07-14' },
    ];
    expect(NewMember.safeParse({ id: ANIA, displayName: 'Tomek', attendance: touching }).success).toBe(false);
  });

  it('cannot set an account (members are added without one)', () => {
    expect(NewMember.parse({ id: ANIA, displayName: 'Tomek', userId: BARTEK })).not.toHaveProperty('userId');
  });
});

describe('MemberRename', () => {
  it('validates the new name like a member name', () => {
    expect(MemberRename.parse({ displayName: ' Tomasz ' })).toEqual({ displayName: 'Tomasz' });
    expect(MemberRename.safeParse({ displayName: '' }).success).toBe(false);
  });
});

describe('canRenameMember', () => {
  const ME = uuid(201);
  it('lets anyone rename a member without an account (ADR-0008)', () => {
    expect(canRenameMember(member(TOMEK, 'Tomek'), ME)).toBe(true);
  });

  it('lets a user rename their own member', () => {
    expect(canRenameMember({ ...member(ANIA, 'Ania'), userId: ME }, ME)).toBe(true);
  });

  it("does not let others rename a member with an account", () => {
    expect(canRenameMember({ ...member(BARTEK, 'Bartek'), userId: USER }, ME)).toBe(false);
  });
});

describe('normalizeAttendance', () => {
  const r = (from: string, to: string): AttendanceRange => ({ from, to });
  const isValidAttendance = (attendance: AttendanceRange[]) =>
    Member.safeParse({ ...member(ANIA, 'Ania'), attendance }).success;

  it('sorts ranges by start date', () => {
    expect(normalizeAttendance([r('2026-07-13', '2026-07-14'), r('2026-07-10', '2026-07-11')])).toEqual([
      r('2026-07-10', '2026-07-11'),
      r('2026-07-13', '2026-07-14'),
    ]);
  });

  it('merges overlapping ranges', () => {
    expect(normalizeAttendance([r('2026-07-10', '2026-07-12'), r('2026-07-11', '2026-07-14')])).toEqual([
      r('2026-07-10', '2026-07-14'),
    ]);
    expect(normalizeAttendance([r('2026-07-10', '2026-07-14'), r('2026-07-11', '2026-07-12')])).toEqual([
      r('2026-07-10', '2026-07-14'),
    ]);
  });

  it('merges touching ranges, also across a month boundary', () => {
    expect(normalizeAttendance([r('2026-07-10', '2026-07-11'), r('2026-07-12', '2026-07-14')])).toEqual([
      r('2026-07-10', '2026-07-14'),
    ]);
    expect(normalizeAttendance([r('2026-08-01', '2026-08-02'), r('2026-07-30', '2026-07-31')])).toEqual([
      r('2026-07-30', '2026-08-02'),
    ]);
  });

  it('turns a per-day grid into ranges', () => {
    const days = ['2026-07-14', '2026-07-10', '2026-07-11', '2026-07-13'];
    expect(normalizeAttendance(days.map((d) => r(d, d)))).toEqual([
      r('2026-07-10', '2026-07-11'),
      r('2026-07-13', '2026-07-14'),
    ]);
  });

  it('leaves a canonical list unchanged', () => {
    const canonical = [r('2026-07-10', '2026-07-10'), r('2026-07-12', '2026-07-12'), r('2026-07-14', '2026-07-20')];
    expect(normalizeAttendance(canonical)).toEqual(canonical);
  });

  it('returns attendance that passes the Member schema', () => {
    const inputs = [
      [r('2026-07-14', '2026-07-14'), r('2026-07-10', '2026-07-13'), r('2026-07-12', '2026-07-12')],
      [r('2026-12-31', '2027-01-01'), r('2026-12-30', '2026-12-30'), r('2027-01-03', '2027-01-04')],
    ];
    for (const input of inputs) expect(isValidAttendance(normalizeAttendance(input))).toBe(true);
  });
});

describe('validateEntryInGroup', () => {
  it('detects unknown members and a wrong base currency rate', () => {
    const e = expense({
      amount: 100,
      rateToBase: '4.2',
      payers: [{ memberId: uuid(999), amount: 100 }],
      split: { mode: 'equal', memberIds: [ANIA] },
    });
    expect(validateEntryInGroup(e, group, members)).toEqual([
      'Rate for the base currency must be 1',
      `Unknown member: ${uuid(999)}`,
    ]);
  });

  it('blocks entries in an archived group', () => {
    const e = expense({ amount: 100, payers: [{ memberId: ANIA, amount: 100 }], split: { mode: 'equal', memberIds: [ANIA] } });
    expect(validateEntryInGroup(e, { ...group, archivedAt: '2026-08-01T00:00:00Z' }, members)).toEqual([
      'Group is archived',
    ]);
  });
});
