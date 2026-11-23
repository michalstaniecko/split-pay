import type { Entry, Member } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { conversationItems, myMemberId, newestAddedEntry } from './conversation';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const GROUP = id(100);
const ANIA = id(1);
const BARTEK = id(2);
const KASIA = id(3);
const ANIA_USER = id(200);

const member = (memberId: string, displayName: string, userId: string | null = null): Member => ({
  id: memberId,
  groupId: GROUP,
  displayName,
  userId,
  attendance: null,
});
const members = [member(ANIA, 'Ania', ANIA_USER), member(BARTEK, 'Bartek'), member(KASIA, 'Kasia')];

let seq = 1000;
const expense = (date: string, createdAt: string, payers: { memberId: string; amount: number }[], amount = 900): Entry => ({
  kind: 'expense',
  id: id(seq++),
  groupId: GROUP,
  version: 1,
  createdBy: ANIA_USER,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
  date,
  amount,
  currency: 'PLN',
  rateToBase: '1',
  title: 'Pizza',
  category: 'food',
  receiptPhotoId: null,
  payers,
  split: { mode: 'equal', memberIds: [ANIA, BARTEK, KASIA] },
});

describe('myMemberId', () => {
  it("is the member linked to the user's account", () => {
    expect(myMemberId(members, ANIA_USER)).toBe(ANIA);
    expect(myMemberId(members, id(999))).toBeNull();
    expect(myMemberId(members, undefined)).toBeNull();
  });
});

describe('conversationItems', () => {
  const bartekLate = expense('2026-07-11', '2026-07-11T20:00:00.000Z', [{ memberId: BARTEK, amount: 900 }]);
  const aniaEarly = expense('2026-07-11', '2026-07-11T08:00:00.000Z', [{ memberId: ANIA, amount: 900 }]);
  const backdated = expense('2026-07-10', '2026-07-12T09:00:00.000Z', [
    { memberId: KASIA, amount: 300 },
    { memberId: ANIA, amount: 600 },
  ]);

  it('orders entries by entry date, then creation time, with a day separator carrying the daily total', () => {
    const { items, stickyHeaderIndices } = conversationItems([bartekLate, aniaEarly, backdated], {
      members,
      myMemberId: ANIA,
      baseCurrency: 'PLN',
    });
    expect(items.map((i) => (i.type === 'day' ? `day ${i.date} ${i.total}` : i.entry.id))).toEqual([
      'day 2026-07-10 900',
      backdated.id,
      'day 2026-07-11 1800',
      aniaEarly.id,
      bartekLate.id,
    ]);
    expect(stickyHeaderIndices).toEqual([0, 2]);
  });

  it('puts my bubbles on the end edge and shows my share', () => {
    const { items } = conversationItems([aniaEarly, bartekLate], { members, myMemberId: ANIA, baseCurrency: 'PLN' });
    const bubbles = items.flatMap((i) => (i.type === 'entry' ? [i] : []));
    expect(bubbles.map((b) => [b.side, b.payerName, b.myShare])).toEqual([
      ['end', 'Ania', 300],
      ['start', 'Bartek', 300],
    ]);
  });

  it('names the largest payer and counts the others; I am a payer if I am among them', () => {
    const { items } = conversationItems([backdated], { members, myMemberId: KASIA, baseCurrency: 'PLN' });
    expect(items[1]).toMatchObject({
      type: 'entry',
      side: 'end',
      payerName: 'Ania',
      payerId: ANIA,
      payerNames: ['Ania', 'Kasia'],
      otherPayers: 1,
    });
  });

  it('with three payers lists them largest first ("Kasia + 2"), ties by member id', () => {
    const three = expense('2026-07-10', '2026-07-10T09:00:00.000Z', [
      { memberId: ANIA, amount: 200 },
      { memberId: BARTEK, amount: 200 },
      { memberId: KASIA, amount: 500 },
    ]);
    const { items } = conversationItems([three], { members, myMemberId: BARTEK, baseCurrency: 'PLN' });
    expect(items[1]).toMatchObject({
      side: 'end',
      payerName: 'Kasia',
      payerId: KASIA,
      payerNames: ['Kasia', 'Ania', 'Bartek'],
      otherPayers: 2,
    });
  });

  it('without a member of mine every bubble is on the start edge and has no share', () => {
    const { items } = conversationItems([aniaEarly], { members, myMemberId: null, baseCurrency: 'PLN' });
    expect(items[1]).toMatchObject({ side: 'start', myShare: null });
  });

  it('is empty without entries', () => {
    expect(conversationItems([], { members, myMemberId: ANIA, baseCurrency: 'PLN' })).toEqual({
      items: [],
      stickyHeaderIndices: [],
    });
  });
});

describe('newestAddedEntry', () => {
  const a = expense('2026-07-11', '2026-07-11T08:00:00.000Z', [{ memberId: ANIA, amount: 900 }]);
  const b = expense('2026-07-10', '2026-07-12T09:00:00.000Z', [{ memberId: ANIA, amount: 900 }]);
  const c = expense('2026-07-12', '2026-07-12T08:00:00.000Z', [{ memberId: ANIA, amount: 900 }]);
  const items = (entries: Entry[]) => conversationItems(entries, { members, myMemberId: ANIA, baseCurrency: 'PLN' }).items;

  it('is nothing on the first load', () => {
    expect(newestAddedEntry(null, items([a, b]))).toBeNull();
  });

  it('is the most recently created of the entries that appeared, with its index', () => {
    const next = items([a, b, c]);
    expect(newestAddedEntry(new Set([a.id]), next)).toEqual({ id: b.id, index: 1 });
    expect(newestAddedEntry(new Set([a.id, b.id]), next)).toEqual({ id: c.id, index: next.length - 1 });
    expect(newestAddedEntry(new Set([a.id, b.id, c.id]), next)).toBeNull();
  });
});
