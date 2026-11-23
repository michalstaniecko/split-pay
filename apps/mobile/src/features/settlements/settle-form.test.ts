import { type Member, type Settlement, toNewEntry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { editedSettlement, parseSettleForm, settleForm, settleFormFromEntry } from './settle-form';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const ANIA = id(1);
const BARTEK = id(2);
const TOMEK = id(3);
const member = (memberId: string, displayName: string): Member => ({
  id: memberId,
  groupId: id(100),
  displayName,
  userId: null,
  attendance: null,
});
const members = [member(ANIA, 'Ania'), member(BARTEK, 'Bartek'), member(TOMEK, 'Tomek')];
const context = { id: id(50), date: '2026-07-12', currency: 'PLN', members };

describe('settleForm', () => {
  it('prefills a suggested transfer: from me, to the recipient, its amount as typed text', () => {
    expect(settleForm({ from: BARTEK, to: ANIA, amount: 3_050, currency: 'PLN', separator: ',' })).toEqual({
      from: BARTEK,
      to: ANIA,
      amount: '30,50',
    });
    expect(settleForm({ from: BARTEK, to: ANIA, amount: 7, currency: 'EUR', separator: '.' }).amount).toBe('0.07');
    expect(settleForm({ from: BARTEK, to: ANIA, amount: 1_500, currency: 'JPY', separator: ',' }).amount).toBe('1500');
  });

  it('starts empty for "Inna spłata" (only "from" defaults to me)', () => {
    expect(settleForm({ from: BARTEK, currency: 'PLN', separator: ',' })).toEqual({ from: BARTEK, to: '', amount: '' });
    expect(settleForm({ from: null, currency: 'PLN', separator: ',' })).toEqual({ from: '', to: '', amount: '' });
  });
});

describe('parseSettleForm', () => {
  it('builds a settlement in the group currency at rate 1', () => {
    expect(parseSettleForm({ from: BARTEK, to: ANIA, amount: '25,5' }, context)).toEqual({
      ok: true,
      value: {
        kind: 'settlement',
        id: id(50),
        date: '2026-07-12',
        amount: 2_550,
        currency: 'PLN',
        rateToBase: '1',
        from: BARTEK,
        to: ANIA,
      },
    });
  });

  it('lists every invalid field', () => {
    expect(parseSettleForm({ from: '', to: id(99), amount: '0' }, context)).toEqual({
      ok: false,
      errors: ['from', 'to', 'amount'],
    });
  });

  it('rejects a settlement to oneself on the recipient field', () => {
    expect(parseSettleForm({ from: TOMEK, to: TOMEK, amount: '10' }, context)).toEqual({ ok: false, errors: ['to'] });
  });
});

describe('editing a settlement', () => {
  const settlement: Settlement = {
    kind: 'settlement',
    id: id(60),
    groupId: id(100),
    version: 1,
    createdBy: ANIA,
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    deletedAt: null,
    date: '2026-07-11',
    amount: 3_050,
    currency: 'PLN',
    rateToBase: '1',
    from: BARTEK,
    to: ANIA,
  };

  it('prefills the sheet from the entry', () => {
    expect(settleFormFromEntry(settlement, ',')).toEqual({ from: BARTEK, to: ANIA, amount: '30,50' });
  });

  it('saves an untouched form as the entry itself (same id, date, currency, rate)', () => {
    expect(editedSettlement(settlement, settleFormFromEntry(settlement, ','), members)).toEqual({
      ok: true,
      value: toNewEntry(settlement),
    });
  });

  it('keeps the id and date when the amount or people change', () => {
    const form = { from: TOMEK, to: ANIA, amount: '12' };
    expect(editedSettlement(settlement, form, members)).toEqual({
      ok: true,
      value: { ...toNewEntry(settlement), from: TOMEK, amount: 1_200 },
    });
  });

  it('validates like a new settlement', () => {
    expect(editedSettlement(settlement, { from: ANIA, to: ANIA, amount: '' }, members)).toEqual({
      ok: false,
      errors: ['to', 'amount'],
    });
  });
});
