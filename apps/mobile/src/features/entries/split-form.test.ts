import type { Member } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import {
  buildPayers,
  buildSplit,
  initialSplitForm,
  participantIds,
  type SplitForm,
  toggleParticipant,
  withMultiplePayers,
  withSplitDate,
} from './split-form';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const GROUP = id(100);
const ANIA = id(1);
const BARTEK = id(2);
const TOMEK = id(4);
const member = (memberId: string, displayName: string, attendance: Member['attendance'] = null): Member => ({
  id: memberId,
  groupId: GROUP,
  displayName,
  userId: null,
  attendance,
});
// Tomek arrives on the 12th.
const members = [member(ANIA, 'Ania'), member(BARTEK, 'Bartek'), member(TOMEK, 'Tomek', [{ from: '2026-07-12', to: '2026-07-14' }])];
const ctx = (amount: number | null, date = '2026-07-11') => ({ amount, digits: 2, members, date });
const form = (overrides: Partial<SplitForm>): SplitForm => ({ ...initialSplitForm, ...overrides });

describe('participants', () => {
  it('follow who is present on the date until picked by hand', () => {
    expect(participantIds(initialSplitForm, members, '2026-07-11')).toEqual([ANIA, BARTEK]);
    expect(participantIds(initialSplitForm, members, '2026-07-12')).toEqual([ANIA, BARTEK, TOMEK]);
  });

  it('are everyone when nobody is present that day', () => {
    const away = [member(ANIA, 'Ania', [{ from: '2026-07-12', to: '2026-07-12' }])];
    expect(participantIds(initialSplitForm, away, '2026-07-20')).toEqual([ANIA]);
  });

  it('can be toggled by hand, in member order', () => {
    const withoutAnia = toggleParticipant(initialSplitForm, ANIA, members, '2026-07-11');
    expect(participantIds(withoutAnia, members, '2026-07-11')).toEqual([BARTEK]);
    const withTomek = toggleParticipant(withoutAnia, TOMEK, members, '2026-07-11');
    expect(participantIds(withTomek, members, '2026-07-11')).toEqual([BARTEK, TOMEK]);
  });

  it('follow a date change unless picked by hand', () => {
    expect(participantIds(withSplitDate(initialSplitForm, members, '2026-07-11', '2026-07-12'), members, '2026-07-12')).toEqual([
      ANIA,
      BARTEK,
      TOMEK,
    ]);
    const picked = toggleParticipant(initialSplitForm, ANIA, members, '2026-07-11');
    expect(participantIds(withSplitDate(picked, members, '2026-07-11', '2026-07-12'), members, '2026-07-12')).toEqual([BARTEK]);
  });
});

describe('buildSplit', () => {
  it('equal: between the participants, shares from resolveSplit', () => {
    expect(buildSplit(initialSplitForm, ctx(1000))).toEqual({
      ok: true,
      split: { mode: 'equal', memberIds: [ANIA, BARTEK] },
      shares: [
        { memberId: ANIA, amount: 500 },
        { memberId: BARTEK, amount: 500 },
      ],
    });
  });

  it('equal: needs at least one participant', () => {
    const nobody = toggleParticipant(toggleParticipant(initialSplitForm, ANIA, members, '2026-07-11'), BARTEK, members, '2026-07-11');
    expect(buildSplit(nobody, ctx(1000))).toEqual({ ok: false, problem: { kind: 'noParticipants' } });
  });

  it('exact: typed amounts must add up to the amount; empty fields are left out', () => {
    const exact = form({ mode: 'exact', exact: { [ANIA]: '7,50', [BARTEK]: '2,5', [TOMEK]: '' } });
    expect(buildSplit(exact, ctx(1000))).toEqual({
      ok: true,
      split: {
        mode: 'exact',
        amounts: [
          { memberId: ANIA, amount: 750 },
          { memberId: BARTEK, amount: 250 },
        ],
      },
      shares: [
        { memberId: ANIA, amount: 750 },
        { memberId: BARTEK, amount: 250 },
      ],
    });
  });

  it('exact: reports the sum when it does not match', () => {
    const exact = form({ mode: 'exact', exact: { [ANIA]: '7', [BARTEK]: '2' } });
    expect(buildSplit(exact, ctx(1000))).toEqual({ ok: false, problem: { kind: 'exactMismatch', sum: 900, amount: 1000 } });
    expect(buildSplit(form({ mode: 'exact' }), ctx(1000))).toEqual({
      ok: false,
      problem: { kind: 'exactMismatch', sum: 0, amount: 1000 },
    });
  });

  it('shares: split by weights, empty or 0 = not taking part', () => {
    const shares = form({ mode: 'shares', weights: { [ANIA]: '2', [BARTEK]: '1', [TOMEK]: '0' } });
    expect(buildSplit(shares, ctx(900))).toEqual({
      ok: true,
      split: {
        mode: 'shares',
        weights: [
          { memberId: ANIA, weight: 2 },
          { memberId: BARTEK, weight: 1 },
        ],
      },
      shares: [
        { memberId: ANIA, amount: 600 },
        { memberId: BARTEK, amount: 300 },
      ],
    });
    expect(buildSplit(form({ mode: 'shares' }), ctx(900))).toEqual({ ok: false, problem: { kind: 'noParticipants' } });
  });

  it('common + personal: personal items to their owners, the rest equally between the participants', () => {
    const cpp = form({ mode: 'commonPlusPersonal', personal: { [TOMEK]: '4' } });
    expect(buildSplit(cpp, ctx(1000))).toEqual({
      ok: true,
      split: { mode: 'commonPlusPersonal', commonMemberIds: [ANIA, BARTEK], personal: [{ memberId: TOMEK, amount: 400 }] },
      shares: [
        { memberId: ANIA, amount: 300 },
        { memberId: BARTEK, amount: 300 },
        { memberId: TOMEK, amount: 400 },
      ],
    });
  });

  it('common + personal: personal items may not exceed the amount and need someone for the rest', () => {
    expect(buildSplit(form({ mode: 'commonPlusPersonal', personal: { [TOMEK]: '11' } }), ctx(1000))).toEqual({
      ok: false,
      problem: { kind: 'personalExceeds', sum: 1100, amount: 1000 },
    });
    const nobodyCommon = toggleParticipant(
      toggleParticipant(form({ mode: 'commonPlusPersonal', personal: { [TOMEK]: '4' } }), ANIA, members, '2026-07-11'),
      BARTEK,
      members,
      '2026-07-11',
    );
    expect(buildSplit(nobodyCommon, ctx(1000))).toEqual({ ok: false, problem: { kind: 'noCommonMembers' } });
    expect(buildSplit(form({ mode: 'commonPlusPersonal' }), ctx(1000))).toEqual({ ok: false, problem: { kind: 'noPersonal' } });
  });

  it('common + personal: personal items covering the whole amount need no common members', () => {
    const nobodyCommon = toggleParticipant(
      toggleParticipant(form({ mode: 'commonPlusPersonal', personal: { [TOMEK]: '10' } }), ANIA, members, '2026-07-11'),
      BARTEK,
      members,
      '2026-07-11',
    );
    expect(buildSplit(nobodyCommon, ctx(1000))).toMatchObject({ ok: true, shares: [{ memberId: TOMEK, amount: 1000 }] });
  });

  it('cannot be resolved without an amount', () => {
    expect(buildSplit(initialSplitForm, ctx(null))).toEqual({ ok: false, problem: { kind: 'noAmount' } });
  });
});

describe('buildPayers', () => {
  it('one payer pays the whole amount by default', () => {
    expect(buildPayers(BARTEK, { multiple: false, amounts: {} }, { amount: 1000, digits: 2 })).toEqual({
      ok: true,
      payers: [{ memberId: BARTEK, amount: 1000 }],
    });
  });

  it('multiple payers: typed amounts must add up to the amount', () => {
    const payers = { multiple: true, amounts: { [ANIA]: '6', [BARTEK]: '4', [TOMEK]: '' } };
    expect(buildPayers('', payers, { amount: 1000, digits: 2 })).toEqual({
      ok: true,
      payers: [
        { memberId: ANIA, amount: 600 },
        { memberId: BARTEK, amount: 400 },
      ],
    });
    expect(buildPayers('', { multiple: true, amounts: { [ANIA]: '6' } }, { amount: 1000, digits: 2 })).toEqual({
      ok: false,
      problem: { kind: 'payersMismatch', sum: 600, amount: 1000 },
    });
  });

  it('switching to multiple payers starts with the single payer paying everything', () => {
    expect(withMultiplePayers({ multiple: false, amounts: {} }, ANIA, '12,50')).toEqual({
      multiple: true,
      amounts: { [ANIA]: '12,50' },
    });
    // Amounts typed earlier are kept.
    expect(withMultiplePayers({ multiple: false, amounts: { [BARTEK]: '3' } }, ANIA, '12,50')).toEqual({
      multiple: true,
      amounts: { [BARTEK]: '3' },
    });
  });
});
