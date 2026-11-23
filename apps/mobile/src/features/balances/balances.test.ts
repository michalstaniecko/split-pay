import type { Member } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { bannerState, drawerRows } from './balances';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const ANIA = id(1);
const BARTEK = id(2);
const TOMEK = id(3);
const member = (memberId: string, displayName: string, userId: string | null = null): Member => ({
  id: memberId,
  groupId: id(100),
  displayName,
  userId,
  attendance: null,
});
const members = [member(ANIA, 'Ania', id(200)), member(BARTEK, 'Bartek', id(201)), member(TOMEK, 'Tomek')];

const settleUp = {
  balances: [
    { memberId: ANIA, amount: 10_000 },
    { memberId: BARTEK, amount: -4_000 },
    { memberId: TOMEK, amount: -6_000 },
  ],
  transfers: [
    { from: TOMEK, to: ANIA, amount: 6_000 },
    { from: BARTEK, to: ANIA, amount: 4_000 },
  ],
};

describe('bannerState', () => {
  it('says how much I owe, am owed, or that I am settled up', () => {
    expect(bannerState(settleUp, BARTEK)).toEqual({ kind: 'owe', amount: 4_000 });
    expect(bannerState(settleUp, ANIA)).toEqual({ kind: 'owed', amount: 10_000 });
    expect(bannerState({ balances: [{ memberId: ANIA, amount: 0 }] }, ANIA)).toEqual({ kind: 'settled', amount: 0 });
  });

  it('is settled without a member of mine (or before my first entry)', () => {
    expect(bannerState(settleUp, null)).toEqual({ kind: 'settled', amount: 0 });
    expect(bannerState({ balances: [] }, ANIA)).toEqual({ kind: 'settled', amount: 0 });
  });
});

describe('drawerRows', () => {
  it('names balances and transfers and marks mine', () => {
    const rows = drawerRows(settleUp, members, BARTEK);
    expect(rows.balances).toEqual([
      { memberId: ANIA, name: 'Ania', amount: 10_000, isMe: false },
      { memberId: BARTEK, name: 'Bartek', amount: -4_000, isMe: true },
      { memberId: TOMEK, name: 'Tomek', amount: -6_000, isMe: false },
    ]);
    expect(rows.transfers).toEqual([
      // My own transfers first: they're the ones I can act on ("Oddaj").
      { key: `${BARTEK}-${ANIA}`, from: BARTEK, to: ANIA, fromName: 'Bartek', toName: 'Ania', amount: 4_000, direction: 'fromMe' },
      { key: `${TOMEK}-${ANIA}`, from: TOMEK, to: ANIA, fromName: 'Tomek', toName: 'Ania', amount: 6_000, direction: 'others' },
    ]);
  });

  it('marks transfers owed to me', () => {
    const rows = drawerRows(settleUp, members, ANIA);
    expect(rows.transfers.map((t) => t.direction)).toEqual(['toMe', 'toMe']);
  });

  it('falls back to "?" for a member missing from the group detail', () => {
    const rows = drawerRows({ balances: [{ memberId: id(9), amount: 0 }], transfers: [] }, members, null);
    expect(rows.balances[0]?.name).toBe('?');
  });
});
