import { randomUUID } from 'node:crypto';
import { type Entry, memberShare, type NewEntry, type Split } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

/** Every split mode and multiple payers (#12): stored as entered, shares and balances follow. */
describe('split modes and multiple payers', () => {
  const { signIn, client } = createTestApp();

  async function setup() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const addMember = (displayName: string) =>
      parseResponse(
        client(ania).groups[':groupId'].members.$post({ param: { groupId: group.id }, json: { id: randomUUID(), displayName } }),
      );
    const A = group.ownerMemberId;
    const B = (await addMember('Bartek')).id;
    const T = (await addMember('Tomek')).id;
    const entries = client(ania).groups[':groupId'].entries;
    const expense = (amount: number, payers: { memberId: string; amount: number }[], split: Split): NewEntry => ({
      kind: 'expense',
      id: randomUUID(),
      date: '2026-07-11',
      title: 'Zakupy',
      amount,
      currency: 'PLN',
      rateToBase: '1',
      category: 'groceries',
      receiptPhotoId: null,
      payers,
      split,
    });
    const create = (input: NewEntry) => entries.$post({ param: { groupId: group.id }, json: input });
    const list = () => parseResponse(entries.$get({ param: { groupId: group.id } })) as Promise<Entry[]>;
    /** Balances from the balances endpoint; shares from the entries list (the Conversation's bubbles). */
    const balancesOf = async () => {
      const body = await parseResponse(client(ania).groups[':groupId'].balances.$get({ param: { groupId: group.id } }));
      return Object.fromEntries(body.balances.map((b) => [b.memberId, b.amount]));
    };
    const sharesOf = async (id: string) => {
      const entry = (await list()).find((e) => e.id === id)!;
      return [A, B, T].map((m) => memberShare(entry, m, 'PLN'));
    };
    return { A, B, T, expense, create, list, balancesOf, sharesOf };
  }

  it('equal: one payer, shared equally between the selected members', async () => {
    const { A, B, T, expense, create, sharesOf, balancesOf } = await setup();
    const input = expense(9000, [{ memberId: A, amount: 9000 }], { mode: 'equal', memberIds: [A, B, T] });
    expect((await create(input)).status).toBe(201);
    expect(await sharesOf(input.id)).toEqual([3000, 3000, 3000]);
    expect(await balancesOf()).toEqual({ [A]: 6000, [B]: -3000, [T]: -3000 });
  });

  it('exact amounts with two payers', async () => {
    const { A, B, T, expense, create, list, sharesOf, balancesOf } = await setup();
    const split: Split = {
      mode: 'exact',
      amounts: [
        { memberId: A, amount: 2000 },
        { memberId: B, amount: 3000 },
        { memberId: T, amount: 5000 },
      ],
    };
    const payers = [
      { memberId: A, amount: 6000 },
      { memberId: B, amount: 4000 },
    ];
    const input = expense(10_000, payers, split);
    expect((await create(input)).status).toBe(201);
    // Stored as entered (ADR-0016).
    expect(await list()).toEqual([expect.objectContaining({ split, payers })]);
    expect(await sharesOf(input.id)).toEqual([2000, 3000, 5000]);
    expect(await balancesOf()).toEqual({ [A]: 4000, [B]: 1000, [T]: -5000 });
  });

  it('shares / weights', async () => {
    const { A, B, T, expense, create, sharesOf, balancesOf } = await setup();
    const input = expense(8000, [{ memberId: T, amount: 8000 }], {
      mode: 'shares',
      weights: [
        { memberId: A, weight: 2 },
        { memberId: B, weight: 1 },
        { memberId: T, weight: 1 },
      ],
    });
    expect((await create(input)).status).toBe(201);
    expect(await sharesOf(input.id)).toEqual([4000, 2000, 2000]);
    expect(await balancesOf()).toEqual({ [A]: -4000, [B]: -2000, [T]: 6000 });
  });

  it('common + personal with two payers', async () => {
    const { A, B, T, expense, create, sharesOf, balancesOf } = await setup();
    const input = expense(
      10_000,
      [
        { memberId: A, amount: 5000 },
        { memberId: B, amount: 5000 },
      ],
      { mode: 'commonPlusPersonal', commonMemberIds: [A, B], personal: [{ memberId: T, amount: 4000 }] },
    );
    expect((await create(input)).status).toBe(201);
    expect(await sharesOf(input.id)).toEqual([3000, 3000, 4000]);
    expect(await balancesOf()).toEqual({ [A]: 2000, [B]: 2000, [T]: -4000 });
  });

  it('balances add up across every mode', async () => {
    const { A, B, T, expense, create, balancesOf } = await setup();
    const inputs = [
      expense(9000, [{ memberId: A, amount: 9000 }], { mode: 'equal', memberIds: [A, B, T] }),
      expense(
        10_000,
        [
          { memberId: A, amount: 6000 },
          { memberId: B, amount: 4000 },
        ],
        {
          mode: 'exact',
          amounts: [
            { memberId: A, amount: 2000 },
            { memberId: B, amount: 3000 },
            { memberId: T, amount: 5000 },
          ],
        },
      ),
      expense(8000, [{ memberId: T, amount: 8000 }], {
        mode: 'shares',
        weights: [
          { memberId: A, weight: 2 },
          { memberId: B, weight: 1 },
          { memberId: T, weight: 1 },
        ],
      }),
      expense(
        10_000,
        [
          { memberId: A, amount: 5000 },
          { memberId: B, amount: 5000 },
        ],
        { mode: 'commonPlusPersonal', commonMemberIds: [A, B], personal: [{ memberId: T, amount: 4000 }] },
      ),
    ];
    for (const input of inputs) expect((await create(input)).status).toBe(201);
    expect(await balancesOf()).toEqual({ [A]: 8000, [B]: -2000, [T]: -6000 });
  });

  it('rejects sums that do not add up', async () => {
    const { A, B, expense, create, list } = await setup();
    const badExact = expense(10_000, [{ memberId: A, amount: 10_000 }], {
      mode: 'exact',
      amounts: [{ memberId: B, amount: 9000 }],
    });
    const badPayers = expense(
      10_000,
      [
        { memberId: A, amount: 6000 },
        { memberId: B, amount: 3000 },
      ],
      { mode: 'equal', memberIds: [A, B] },
    );
    const personalTooBig = expense(10_000, [{ memberId: A, amount: 10_000 }], {
      mode: 'commonPlusPersonal',
      commonMemberIds: [A],
      personal: [{ memberId: B, amount: 11_000 }],
    });
    for (const input of [badExact, badPayers, personalTooBig]) {
      const res = await create(input);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_entry' });
    }
    expect(await list()).toEqual([]);
  });
});
