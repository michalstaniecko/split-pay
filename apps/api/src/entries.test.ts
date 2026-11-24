import { randomUUID } from 'node:crypto';
import type { Entry, NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

const newGroup = () => ({
  id: randomUUID(),
  name: 'Mazury',
  emoji: '⛵',
  color: '#1E88E5',
  baseCurrency: 'PLN',
  startDate: '2026-07-10',
  endDate: '2026-07-14',
});

describe('entries', () => {
  const { app, signIn, client, json } = createTestApp();

  /** Ania's trip with Tomek (member without an account). */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({
        param: { groupId: group.id },
        json: { id: randomUUID(), displayName: 'Tomek' },
      }),
    );
    const me = group.ownerMemberId;
    const expense = (overrides: Partial<Record<string, unknown>> = {}) =>
      ({
        kind: 'expense',
        id: randomUUID(),
        date: '2026-07-11',
        title: 'Pizza',
        amount: 10_000,
        currency: 'PLN',
        rateToBase: '1',
        category: 'food',
        receiptPhotoId: null,
        payers: [{ memberId: me, amount: 10_000 }],
        split: { mode: 'equal', memberIds: [me, tomek.id] },
        ...overrides,
      }) as NewEntry;
    const entries = (session = ania) => client(session).groups[':groupId'].entries;
    const create = (input: NewEntry, session = ania) =>
      entries(session).$post({ param: { groupId: group.id }, json: input });
    const list = (session = ania) => parseResponse(entries(session).$get({ param: { groupId: group.id } }));
    return { ania, group, me, tomek, expense, create, list };
  }

  it('creates an equal-split expense as version 1 by the caller', async () => {
    const { ania, group, me, expense, create, list } = await setup();
    const input = expense();

    const res = await create(input);
    expect(res.status).toBe(201);
    const created = (await res.json()) as Entry;
    expect(created).toEqual({
      ...input,
      groupId: group.id,
      version: 1,
      createdBy: ania.userId,
      createdByMember: me,
      createdAt: expect.any(String),
      updatedAt: created.createdAt,
      deletedAt: null,
    });
    expect(await list()).toEqual([created]);
  });

  it('repeating the same create does not duplicate the entry', async () => {
    const { expense, create, list } = await setup();
    const input = expense();
    const first = await (await create(input)).json();

    const again = await create(input);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    expect(await list()).toHaveLength(1);
  });

  it('an id used in another group answers 409', async () => {
    const { ania, expense, create } = await setup();
    const input = expense();
    await create(input);
    const other = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const otherMe = other.ownerMemberId;

    const res = await client(ania).groups[':groupId'].entries.$post({
      param: { groupId: other.id },
      json: { ...input, payers: [{ memberId: otherMe, amount: 10_000 }], split: { mode: 'equal', memberIds: [otherMe] } } as NewEntry,
    });
    expect(res.status).toBe(409);
  });

  it('lists entries by entry date, then creation time', async () => {
    const { expense, create, list } = await setup();
    const late = expense({ title: 'Late', date: '2026-07-13' });
    const first = expense({ title: 'First', date: '2026-07-11' });
    const backdated = expense({ title: 'Backdated', date: '2026-07-10' });
    const second = expense({ title: 'Second', date: '2026-07-11' });
    for (const input of [late, first, backdated, second]) expect((await create(input)).status).toBe(201);

    expect((await list()).map((e) => e.kind === 'expense' && e.title)).toEqual(['Backdated', 'First', 'Second', 'Late']);
  });

  it('stores every entry kind', async () => {
    const { me, tomek, expense, create, list } = await setup();
    const income = {
      ...expense({ title: 'Kaucja', category: 'accommodation' }),
      kind: 'income',
      payers: undefined,
      recipients: [{ memberId: me, amount: 10_000 }],
    } as unknown as NewEntry;
    const settlement: NewEntry = {
      kind: 'settlement',
      id: randomUUID(),
      date: '2026-07-12',
      amount: 2_500,
      currency: 'EUR',
      rateToBase: '4.2715',
      from: tomek.id,
      to: me,
    };
    const split = { mode: 'commonPlusPersonal', commonMemberIds: [me, tomek.id], personal: [{ memberId: tomek.id, amount: 400 }] };
    const foreign = expense({ currency: 'EUR', rateToBase: '4.2715', split });
    for (const input of [income, settlement, foreign]) expect((await create(input)).status, JSON.stringify(input)).toBe(201);

    const stored = await list();
    expect(stored.map((e) => e.kind).sort()).toEqual(['expense', 'income', 'settlement']);
    expect(stored).toContainEqual(expect.objectContaining({ ...settlement }));
    expect(stored).toContainEqual(expect.objectContaining({ id: foreign.id, split, rateToBase: '4.2715' }));
    expect(stored).toContainEqual(expect.objectContaining({ id: income.id, recipients: [{ memberId: me, amount: 10_000 }] }));
  });

  it('validates with the Entry rules and against the group', async () => {
    const { ania, group, me, expense, list } = await setup();
    const cases: [string, unknown][] = [
      ['payers not adding up', expense({ payers: [{ memberId: me, amount: 9_000 }] })],
      ['empty title', expense({ title: '  ' })],
      ['zero amount', expense({ amount: 0, payers: [{ memberId: me, amount: 0 }] })],
      ['float amount', expense({ amount: 100.5, payers: [{ memberId: me, amount: 100.5 }] })],
      ['unknown member', expense({ split: { mode: 'equal', memberIds: [me, randomUUID()] } })],
      ['base currency rate not 1', expense({ rateToBase: '4.2' })],
      ['missing kind', { ...expense(), kind: undefined }],
      ['bad id', expense({ id: 'nope' })],
    ];
    for (const [name, body] of cases) {
      const res = await app.request(`/groups/${group.id}/entries`, json(body, { cookie: ania.cookie }));
      expect(res.status, name).toBe(400);
    }
    expect(await list()).toEqual([]);
  });

  it('is scoped to members of the group', async () => {
    const { group, expense, create } = await setup();
    const bartek = await signIn('bartek@example.com');
    expect((await create(expense(), bartek)).status).toBe(404);
    expect((await client(bartek).groups[':groupId'].entries.$get({ param: { groupId: group.id } })).status).toBe(404);
    expect((await client().groups[':groupId'].entries.$get({ param: { groupId: group.id } })).status).toBe(401);
  });

  it('moves the group to the top of the inbox with the newest entry as its preview', async () => {
    const { ania, group, expense, create } = await setup();
    const newer = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    expect((await parseResponse(client(ania).groups.$get())).map((g) => g.id)).toEqual([newer.id, group.id]);

    // A backdated entry is still the most recently added one.
    await create(expense({ title: 'Obiad', date: '2026-07-12' }));
    await create(expense({ title: 'Lody', date: '2026-07-10', amount: 1_500, payers: [{ memberId: group.ownerMemberId, amount: 1_500 }] }));

    const inbox = await parseResponse(client(ania).groups.$get());
    expect(inbox.map((g) => g.id)).toEqual([group.id, newer.id]);
    expect(inbox[0]!.lastEntry).toEqual({
      id: expect.any(String),
      kind: 'expense',
      title: 'Lody',
      amount: 1_500,
      currency: 'PLN',
      createdAt: expect.any(String),
    });
    expect(inbox[1]!.lastEntry).toBeNull();
  });
});

describe('quick bills', () => {
  const { app, signIn, client, json } = createTestApp();

  const quickBill = () => ({
    groupId: randomUUID(),
    expenseId: randomUUID(),
    title: 'Pizza',
    amount: 12_001,
    currency: 'PLN',
    date: '2026-11-23',
    color: '#1E88E5',
    people: [
      { id: randomUUID(), displayName: 'Kasia' },
      { id: randomUUID(), displayName: 'Tomek' },
    ],
  });

  it('creates the group, its members without an account and one equal-split expense paid by me', async () => {
    const ania = await signIn('ania@example.com');
    const input = quickBill();

    const res = await client(ania)['quick-bills'].$post({ json: input });
    expect(res.status).toBe(201);
    const { group } = (await res.json()) as { group: Record<string, unknown> };
    expect(group).toMatchObject({ id: input.groupId, name: 'Pizza', emoji: '🧾', baseCurrency: 'PLN', startDate: null, endDate: null });

    const detail = await parseResponse(client(ania).groups[':groupId'].$get({ param: { groupId: input.groupId } }));
    const me = detail.ownerMemberId;
    expect(detail.members.map((m) => [m.displayName, m.userId])).toEqual([
      ['ania', ania.userId],
      ['Kasia', null],
      ['Tomek', null],
    ]);

    const entries = await parseResponse(
      client(ania).groups[':groupId'].entries.$get({ param: { groupId: input.groupId } }),
    );
    expect(entries).toEqual([
      expect.objectContaining({
        kind: 'expense',
        id: input.expenseId,
        title: 'Pizza',
        category: 'food',
        date: '2026-11-23',
        amount: 12_001,
        payers: [{ memberId: me, amount: 12_001 }],
        split: { mode: 'equal', memberIds: [me, input.people[0]!.id, input.people[1]!.id] },
        createdBy: ania.userId,
      }),
    ]);

    const inbox = await parseResponse(client(ania).groups.$get());
    expect(inbox[0]).toMatchObject({ id: input.groupId, lastEntry: { title: 'Pizza' } });
  });

  it('repeating the same quick bill does not duplicate anything; another user gets 409', async () => {
    const ania = await signIn('ania@example.com');
    const input = quickBill();
    expect((await client(ania)['quick-bills'].$post({ json: input })).status).toBe(201);
    expect((await client(ania)['quick-bills'].$post({ json: input })).status).toBe(200);
    expect(await parseResponse(client(ania).groups.$get())).toHaveLength(1);

    const bartek = await signIn('bartek@example.com');
    expect((await client(bartek)['quick-bills'].$post({ json: input })).status).toBe(409);
  });

  it('validates input and requires sign-in', async () => {
    const ania = await signIn('ania@example.com');
    const res = await app.request('/quick-bills', json({ ...quickBill(), people: [] }, { cookie: ania.cookie }));
    expect(res.status).toBe(400);
    expect((await client()['quick-bills'].$post({ json: quickBill() })).status).toBe(401);
  });
});
