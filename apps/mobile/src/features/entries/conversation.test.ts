import type { Entry, Member } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { type ConversationItem, conversationItems, myMemberId, newestAddedEntry, separatorTotal } from './conversation';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const GROUP = id(100);
const ANIA = id(1);
const BARTEK = id(2);
const KASIA = id(3);
const ANIA_USER = id(200);

const member = (memberId: string, displayName: string, userId: string | null = null): Member & { displayName: string } => ({
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
  createdByMember: null,
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
    expect(myMemberId({ members }, ANIA_USER)).toBe(ANIA);
    expect(myMemberId({ members }, id(999))).toBeNull();
    expect(myMemberId({ members }, undefined)).toBeNull();
  });

  it('in a local group is the device member ("Ja"), signed in or not', () => {
    const local = { local: true, deviceMemberId: BARTEK, members: members.map((m) => ({ ...m, userId: null })) };
    expect(myMemberId(local, undefined)).toBe(BARTEK);
    expect(myMemberId(local, ANIA_USER)).toBe(BARTEK);
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
    expect(items.map((i) => (i.type === 'day' ? `day ${i.date} ${i.total}` : i.type === 'entry' ? i.entry.id : i.key))).toEqual([
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

  it('marks edited entries ("edytowano")', () => {
    const edited = { ...aniaEarly, version: 2 };
    const { items } = conversationItems([edited, bartekLate], { members, myMemberId: ANIA, baseCurrency: 'PLN' });
    expect(items.flatMap((i) => (i.type === 'entry' ? [i.edited] : []))).toEqual([true, false]);
  });

  it('without a member of mine every bubble is on the start edge and has no share', () => {
    const { items } = conversationItems([aniaEarly], { members, myMemberId: null, baseCurrency: 'PLN' });
    expect(items[1]).toMatchObject({ side: 'start', myShare: null });
  });

  it('a foreign-currency bubble carries its base amount; day totals and my share are in the base currency', () => {
    // 20.00 EUR at 4.3157 = 86.31 PLN; Ania's share 6.67 EUR of 20.00 → 28.79 PLN
    const dinner = { ...aniaEarly, amount: 2_000, currency: 'EUR', rateToBase: '4.3157', payers: [{ memberId: ANIA, amount: 2_000 }] };
    const { items } = conversationItems([dinner, bartekLate], { members, myMemberId: ANIA, baseCurrency: 'PLN' });
    expect(items[0]).toMatchObject({ type: 'day', total: 8_631 + 900 });
    expect(items[1]).toMatchObject({ type: 'entry', baseAmount: 8_631, myShare: 2_879 });
    expect(items[2]).toMatchObject({ type: 'entry', baseAmount: null });
  });

  describe('claims', () => {
    const claim = (n: number, claimedAt: string, undoneAt: string | null = null) => ({ id: id(n), claimedAt, undoneAt });
    // Tests run in any time zone: map timestamps to UTC dates.
    const context = { members, myMemberId: ANIA, baseCurrency: 'PLN', localDate: (iso: string) => iso.slice(0, 10) };
    const keys = (items: ConversationItem[]) =>
      items.map((i) => (i.type === 'day' ? `day ${i.date} ${i.total}` : i.type === 'entry' ? i.entry.id : `claim ${i.claim.id}`));

    it('are system messages among the entries of their day, ordered by claim time', () => {
      const midday = claim(1, '2026-07-11T12:00:00.000Z');
      const { items, stickyHeaderIndices } = conversationItems([bartekLate, aniaEarly], { ...context, claims: [midday] });
      expect(keys(items)).toEqual(['day 2026-07-11 1800', aniaEarly.id, `claim ${midday.id}`, bartekLate.id]);
      expect(stickyHeaderIndices).toEqual([0]);
      expect(items[2]).toEqual({ type: 'claim', key: `claim-${midday.id}`, claim: midday });
    });

    it('open their own day when it has no entries; undone claims are not shown', () => {
      const later = claim(2, '2026-07-20T09:00:00.000Z');
      const earlier = claim(1, '2026-07-01T09:00:00.000Z');
      const undone = claim(3, '2026-07-11T09:00:00.000Z', '2026-07-11T10:00:00.000Z');
      const { items, stickyHeaderIndices } = conversationItems([aniaEarly], { ...context, claims: [later, undone, earlier] });
      expect(keys(items)).toEqual([
        'day 2026-07-01 0',
        `claim ${earlier.id}`,
        'day 2026-07-11 900',
        aniaEarly.id,
        'day 2026-07-20 0',
        `claim ${later.id}`,
      ]);
      expect(stickyHeaderIndices).toEqual([0, 2, 4]);
    });
  });

  describe('incomes', () => {
    // Kasia and Bartek got the 600 deposit back; it belongs to all three.
    const { payers: _payers, ...fields } = expense('2026-07-11', '2026-07-11T21:00:00.000Z', [], 600) as Extract<
      Entry,
      { kind: 'expense' }
    >;
    const refund: Entry = {
      ...fields,
      kind: 'income',
      title: 'Zwrot kaucji',
      recipients: [
        { memberId: BARTEK, amount: 200 },
        { memberId: KASIA, amount: 400 },
      ],
    };

    it('are bubbles from their largest recipient, on the end edge when I am among the recipients', () => {
      const asBartek = conversationItems([refund], { members, myMemberId: BARTEK, baseCurrency: 'PLN' });
      expect(asBartek.items[1]).toMatchObject({ type: 'entry', side: 'end', payerName: 'Kasia', otherPayers: 1 });
      const asAnia = conversationItems([refund], { members, myMemberId: ANIA, baseCurrency: 'PLN' });
      expect(asAnia.items[1]).toMatchObject({ side: 'start', myShare: -200 });
    });

    it("reduce the day separator's total", () => {
      const { items } = conversationItems([aniaEarly, bartekLate, refund], { members, myMemberId: ANIA, baseCurrency: 'PLN' });
      expect(items[0]).toMatchObject({ type: 'day', date: '2026-07-11', total: 1800 - 600 });
    });

    describe('separator total shown', () => {
      const day = (entries: Entry[]) => {
        const first = conversationItems(entries, { members, myMemberId: ANIA, baseCurrency: 'PLN' }).items[0];
        if (first?.type !== 'day') throw new Error('expected a day separator');
        return first;
      };

      it('is the net total on a normal day', () => {
        expect(separatorTotal(day([aniaEarly, bartekLate, refund]))).toBe(1200);
      });

      it('is hidden on a day with only an income', () => {
        const only = day([refund]);
        expect(only.total).toBe(-600);
        expect(separatorTotal(only)).toBeNull();
      });

      it('is hidden on a day netting to zero', () => {
        const even = day([expense('2026-07-11', '2026-07-11T08:00:00.000Z', [{ memberId: ANIA, amount: 600 }], 600), refund]);
        expect(even.total).toBe(0);
        expect(separatorTotal(even)).toBeNull();
      });
    });
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
