import { describe, expect, it } from 'vitest';
import { defaultParticipants, resolveSplit } from './split';
import { ANIA, BARTEK, KASIA, TOMEK, ZOSIA, members } from './test-fixtures';

describe('resolveSplit', () => {
  it('equal', () => {
    expect(resolveSplit({ mode: 'equal', memberIds: [KASIA, ANIA, BARTEK] }, 10_000)).toEqual([
      { memberId: ANIA, amount: 3334 },
      { memberId: BARTEK, amount: 3333 },
      { memberId: KASIA, amount: 3333 },
    ]);
  });

  it('exact', () => {
    expect(
      resolveSplit(
        { mode: 'exact', amounts: [{ memberId: BARTEK, amount: 700 }, { memberId: ANIA, amount: 300 }] },
        1000,
      ),
    ).toEqual([
      { memberId: ANIA, amount: 300 },
      { memberId: BARTEK, amount: 700 },
    ]);
  });

  it('shares 2:1:1', () => {
    expect(
      resolveSplit(
        {
          mode: 'shares',
          weights: [
            { memberId: ANIA, weight: 2 },
            { memberId: BARTEK, weight: 1 },
            { memberId: KASIA, weight: 1 },
          ],
        },
        1001,
      ).map((a) => a.amount),
    ).toEqual([501, 250, 250]);
  });

  it('common + personal: 150 PLN of groceries incl. Tomek\'s 24 PLN beer', () => {
    expect(
      resolveSplit(
        {
          mode: 'commonPlusPersonal',
          commonMemberIds: [ANIA, BARTEK, KASIA, TOMEK],
          personal: [{ memberId: TOMEK, amount: 2400 }],
        },
        15_000,
      ),
    ).toEqual([
      { memberId: ANIA, amount: 3150 },
      { memberId: BARTEK, amount: 3150 },
      { memberId: KASIA, amount: 3150 },
      { memberId: TOMEK, amount: 5550 },
    ]);
  });

  it('common + personal: several items of one person who is outside the common part', () => {
    expect(
      resolveSplit(
        {
          mode: 'commonPlusPersonal',
          commonMemberIds: [ANIA, BARTEK],
          personal: [
            { memberId: KASIA, amount: 100 },
            { memberId: KASIA, amount: 50 },
          ],
        },
        1150,
      ),
    ).toEqual([
      { memberId: ANIA, amount: 500 },
      { memberId: BARTEK, amount: 500 },
      { memberId: KASIA, amount: 150 },
    ]);
  });
});

describe('defaultParticipants', () => {
  it('skips members absent on that day', () => {
    expect(defaultParticipants(members, '2026-07-11')).toEqual([ANIA, BARTEK, KASIA, ZOSIA]);
    expect(defaultParticipants(members, '2026-07-12')).toEqual([ANIA, BARTEK, KASIA, TOMEK]);
  });

  it('excludes a member during the gap after they leave and includes them from the day they return', () => {
    expect(defaultParticipants(members, '2026-07-10')).toContain(ZOSIA);
    expect(defaultParticipants(members, '2026-07-11')).toContain(ZOSIA);
    expect(defaultParticipants(members, '2026-07-12')).not.toContain(ZOSIA);
    expect(defaultParticipants(members, '2026-07-13')).toContain(ZOSIA);
    expect(defaultParticipants(members, '2026-07-14')).toContain(ZOSIA);
  });

  it('always includes members without attendance (whole trip)', () => {
    for (const date of ['2025-01-01', '2026-07-12', '2027-12-31']) {
      expect(defaultParticipants(members, date)).toEqual(expect.arrayContaining([ANIA, BARTEK, KASIA]));
    }
  });
});
