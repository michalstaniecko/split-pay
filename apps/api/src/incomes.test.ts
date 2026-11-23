import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('incomes', () => {
  const { signIn, client } = createTestApp();

  /** Ania's trip with Bartek (joined through the group link) and Tomek (no account). */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartekSession = await signIn('bartek@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    const bartek = await parseResponse(client(bartekSession).links[':token'].join.$post({ param: { token } }));
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({
        param: { groupId: group.id },
        json: { id: randomUUID(), displayName: 'Tomek' },
      }),
    );
    const ids = { ania: group.ownerMemberId, bartek: bartek.memberId, tomek: tomek.id };
    const everyone = [ids.ania, ids.bartek, ids.tomek];
    const entries = (session = ania) => client(session).groups[':groupId'].entries;
    const create = (input: NewEntry, session = ania) => entries(session).$post({ param: { groupId: group.id }, json: input });
    const list = (session = ania) => parseResponse(entries(session).$get({ param: { groupId: group.id } }));
    const balances = async () => {
      const body = await parseResponse(client(ania).groups[':groupId'].balances.$get({ param: { groupId: group.id } }));
      return Object.fromEntries(body.balances.map((b) => [b.memberId, b.amount]));
    };
    return { ania, bartekSession, group, ids, everyone, create, list, balances };
  }

  const income = (fields: { amount: number; recipients: { memberId: string; amount: number }[]; memberIds: string[] }): NewEntry => ({
    kind: 'income',
    id: randomUUID(),
    date: '2026-07-14',
    title: 'Zwrot kaucji',
    amount: fields.amount,
    currency: 'PLN',
    rateToBase: '1',
    category: 'accommodation',
    receiptPhotoId: null,
    recipients: fields.recipients,
    split: { mode: 'equal', memberIds: fields.memberIds },
  });

  it('any member records an income with one or more recipients; every member sees it', async () => {
    const { bartekSession, ids, everyone, create, list } = await setup();
    const refund = income({
      amount: 12_000,
      recipients: [
        { memberId: ids.bartek, amount: 9_000 },
        { memberId: ids.tomek, amount: 3_000 },
      ],
      memberIds: everyone,
    });

    expect((await create(refund, bartekSession)).status).toBe(201);
    expect(await list()).toEqual([expect.objectContaining({ ...refund, version: 1, createdBy: bartekSession.userId })]);
  });

  it('balances include incomes: the recipients owe the participants their shares', async () => {
    const { ids, everyone, create, balances } = await setup();
    // Ania paid the 300 zł deposit for everyone; Bartek got it back as a 120 zł partial refund.
    const deposit: NewEntry = {
      kind: 'expense',
      id: randomUUID(),
      date: '2026-07-10',
      title: 'Kaucja',
      amount: 30_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'accommodation',
      receiptPhotoId: null,
      payers: [{ memberId: ids.ania, amount: 30_000 }],
      split: { mode: 'equal', memberIds: everyone },
    };
    const refund = income({ amount: 12_000, recipients: [{ memberId: ids.bartek, amount: 12_000 }], memberIds: everyone });
    for (const input of [deposit, refund]) expect((await create(input)).status).toBe(201);

    expect(await balances()).toEqual({
      [ids.ania]: 30_000 - 10_000 + 4_000, // paid 300, consumed 100, owed 40 of the refund
      [ids.bartek]: -10_000 - 12_000 + 4_000, // consumed 100, holds the 120 refund, 40 of it is his
      [ids.tomek]: -10_000 + 4_000,
    });
  });

  it('rejects an income whose recipients do not add up or are not in the group', async () => {
    const { ids, everyone, create, list } = await setup();
    const short = income({ amount: 12_000, recipients: [{ memberId: ids.bartek, amount: 10_000 }], memberIds: everyone });
    const stranger = income({ amount: 12_000, recipients: [{ memberId: randomUUID(), amount: 12_000 }], memberIds: everyone });

    for (const input of [short, stranger]) {
      const res = await create(input);
      expect(res.status, JSON.stringify(input)).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_entry' });
    }
    expect(await list()).toEqual([]);
  });

  it('an income is the group\'s latest entry in the inbox', async () => {
    const { ania, group, ids, everyone, create } = await setup();
    const refund = income({ amount: 12_000, recipients: [{ memberId: ids.ania, amount: 12_000 }], memberIds: everyone });
    await create(refund);

    const groups = await parseResponse(client(ania).groups.$get());
    expect(groups.find((g) => g.id === group.id)?.lastEntry).toMatchObject({ id: refund.id, kind: 'income', amount: 12_000 });
  });
});
