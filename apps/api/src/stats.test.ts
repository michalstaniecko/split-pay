import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('group stats', () => {
  const { signIn, client } = createTestApp();

  /** Ania's three-day trip with Tomek (member without an account), base currency PLN. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: {
          id: randomUUID(),
          name: 'Mazury',
          emoji: '⛵',
          color: '#1E88E5',
          baseCurrency: 'PLN',
          startDate: '2026-07-10',
          endDate: '2026-07-12',
        },
      }),
    );
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({
        param: { groupId: group.id },
        json: { id: randomUUID(), displayName: 'Tomek' },
      }),
    );
    const create = async (input: NewEntry) => {
      const res = await client(ania).groups[':groupId'].entries.$post({ param: { groupId: group.id }, json: input });
      expect(res.status).toBe(201);
    };
    const stats = (session = ania) => client(session).groups[':groupId'].stats.$get({ param: { groupId: group.id } });
    return { ania, group, me: group.ownerMemberId, tomek: tomek.id, create, stats };
  }

  const fields = (date: string, title: string, category: string, amount: number) => ({
    id: randomUUID(),
    date,
    title,
    category,
    amount,
    currency: 'PLN',
    rateToBase: '1',
    receiptPhotoId: null,
  });

  it('returns the days × people table and categories of a multi-day trip in the base currency', async () => {
    const { me: ania, tomek, create, stats } = await setup();
    // Day 1: Ania buys groceries for both.
    await create({
      kind: 'expense',
      ...fields('2026-07-10', 'Zakupy', 'groceries', 20_000),
      payers: [{ memberId: ania, amount: 20_000 }],
      split: { mode: 'equal', memberIds: [ania, tomek] },
    } as NewEntry);
    // Day 2: Tomek pays 30 EUR (rate 4.30) for a dinner for both.
    await create({
      kind: 'expense',
      ...fields('2026-07-11', 'Kolacja', 'food', 3_000),
      currency: 'EUR',
      rateToBase: '4.30',
      payers: [{ memberId: tomek, amount: 3_000 }],
      split: { mode: 'equal', memberIds: [ania, tomek] },
    } as NewEntry);
    // Day 2: Ania pays the accommodation for both.
    await create({
      kind: 'expense',
      ...fields('2026-07-11', 'Nocleg', 'accommodation', 40_000),
      payers: [{ memberId: ania, amount: 40_000 }],
      split: { mode: 'equal', memberIds: [ania, tomek] },
    } as NewEntry);
    // Day 3: Tomek gets the 100 PLN deposit back — it belongs to both.
    await create({
      kind: 'income',
      ...fields('2026-07-12', 'Kaucja', 'accommodation', 10_000),
      recipients: [{ memberId: tomek, amount: 10_000 }],
      split: { mode: 'equal', memberIds: [ania, tomek] },
    } as NewEntry);
    // Day 3: Tomek settles up — not spending, so not in stats.
    await create({ kind: 'settlement', id: randomUUID(), date: '2026-07-12', amount: 5_000, currency: 'PLN', rateToBase: '1', from: tomek, to: ania });

    const body = await parseResponse(stats());
    const row = (memberId: string, paid: number, consumed: number) => ({ memberId, paid, consumed });
    const sorted = (rows: ReturnType<typeof row>[]) => rows.sort((a, b) => (a.memberId < b.memberId ? -1 : 1));

    expect(body.baseCurrency).toBe('PLN');
    expect(body.days).toEqual([
      { date: '2026-07-10', total: 20_000, members: sorted([row(ania, 20_000, 10_000), row(tomek, 0, 10_000)]) },
      {
        date: '2026-07-11',
        total: 12_900 + 40_000,
        members: sorted([row(ania, 40_000, 6_450 + 20_000), row(tomek, 12_900, 6_450 + 20_000)]),
      },
      { date: '2026-07-12', total: -10_000, members: sorted([row(ania, 0, -5_000), row(tomek, -10_000, -5_000)]) },
    ]);
    expect(body.members).toEqual(sorted([row(ania, 60_000, 31_450), row(tomek, 2_900, 31_450)]));
    expect(body.categories).toEqual([
      { category: 'accommodation', amount: 30_000 },
      { category: 'groceries', amount: 20_000 },
      { category: 'food', amount: 12_900 },
    ]);
    expect(body.total).toBe(62_900);
  });

  it('is empty for a group without entries', async () => {
    const { stats } = await setup();
    expect(await parseResponse(stats())).toEqual({ baseCurrency: 'PLN', days: [], members: [], categories: [], total: 0 });
  });

  it('answers 404 to someone outside the group and 401 without a session', async () => {
    const { group, stats } = await setup();
    const bartek = await signIn('bartek@example.com');
    expect((await stats(bartek)).status).toBe(404);
    expect((await client().groups[':groupId'].stats.$get({ param: { groupId: group.id } })).status).toBe(401);
    expect((await client(bartek).groups[':groupId'].stats.$get({ param: { groupId: 'not-a-uuid' } })).status).toBe(404);
  });
});
