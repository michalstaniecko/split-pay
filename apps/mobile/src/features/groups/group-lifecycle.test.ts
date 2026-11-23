import { describe, expect, it } from 'vitest';
import { bubbleActions, inboxSections, leaveState } from './group-lifecycle';

describe('inboxSections', () => {
  it('keeps the activity order and moves archived groups to their own section', () => {
    const groups = [
      { id: 'a', archivedAt: null },
      { id: 'b', archivedAt: '2026-08-01T10:00:00.000Z' },
      { id: 'c', archivedAt: null },
      { id: 'd', archivedAt: '2026-07-01T10:00:00.000Z' },
    ];
    expect(inboxSections(groups)).toEqual({
      active: [groups[0], groups[2]],
      archived: [groups[1], groups[3]],
    });
  });
});

describe('leaveState', () => {
  const balances = {
    balances: [
      { memberId: 'ania', amount: 2500 },
      { memberId: 'bartek', amount: -2500 },
      { memberId: 'tomek', amount: 0 },
    ],
  };

  it('allows leaving with a zero balance', () => {
    expect(leaveState(balances, 'tomek')).toEqual({ canLeave: true, balance: 0 });
  });

  it('blocks leaving with money owed either way', () => {
    expect(leaveState(balances, 'bartek')).toEqual({ canLeave: false, balance: -2500 });
    expect(leaveState(balances, 'ania')).toEqual({ canLeave: false, balance: 2500 });
  });

  it('blocks while balances are unknown', () => {
    expect(leaveState(undefined, 'tomek')).toEqual({ canLeave: false, balance: null });
    expect(leaveState(balances, null)).toEqual({ canLeave: false, balance: null });
  });
});

describe('bubbleActions', () => {
  it('offers every action in an active group', () => {
    expect(bubbleActions({ archived: false })).toEqual(['edit', 'delete', 'history', 'copyAmount']);
  });

  it('offers only history and copying the amount in an archived group', () => {
    expect(bubbleActions({ archived: true })).toEqual(['history', 'copyAmount']);
  });
});
