import { describe, expect, it } from 'vitest';
import { Entry, Group, validateEntryInGroup } from './model';
import { ANIA, BARTEK, KASIA, expense, group, members, settlement, uuid } from './test-fixtures';

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
