import { randomUUID } from 'node:crypto';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

const newGroup = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  name: 'Mazury',
  emoji: '⛵',
  color: '#1E88E5',
  baseCurrency: 'PLN',
  startDate: '2026-07-10',
  endDate: '2026-07-14',
  ...overrides,
});

describe('groups', () => {
  const { app, signIn, client, json } = createTestApp();

  it('creates a group with the creator as owner and first member', async () => {
    const ania = await signIn('ania@example.com');
    const input = newGroup();

    const res = await client(ania).groups.$post({ json: input });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({ ...input, simplifyDebts: true, archivedAt: null });

    const group = await parseResponse(client(ania).groups[':groupId'].$get({ param: { groupId: input.id } }));
    expect(group.members).toEqual([
      { id: group.ownerMemberId, groupId: input.id, displayName: 'ania', userId: ania.userId, attendance: null },
    ]);
  });

  it('creates a group without dates', async () => {
    const ania = await signIn();
    const res = await client(ania).groups.$post({ json: newGroup({ startDate: null, endDate: null }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ startDate: null, endDate: null });
  });

  it('validates input with the shared Group rules', async () => {
    const ania = await signIn();
    const cases = [
      newGroup({ name: '  ' }),
      newGroup({ endDate: null }),
      newGroup({ startDate: '2026-07-20' }),
      newGroup({ color: 'blue' }),
      newGroup({ id: 'not-a-uuid' }),
    ];
    for (const body of cases) {
      const res = await app.request('/groups', json(body, { cookie: ania.cookie }));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await parseResponse(client(ania).groups.$get())).toEqual([]);
  });

  it('repeating the same create does not duplicate the group', async () => {
    const ania = await signIn();
    const input = newGroup();
    expect((await client(ania).groups.$post({ json: input })).status).toBe(201);
    const again = await client(ania).groups.$post({ json: input });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ id: input.id });

    expect(await parseResponse(client(ania).groups.$get())).toHaveLength(1);
    const group = await parseResponse(client(ania).groups[':groupId'].$get({ param: { groupId: input.id } }));
    expect(group.members).toHaveLength(1);
  });

  it("cannot take over another user's group id", async () => {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const input = newGroup();
    await client(ania).groups.$post({ json: input });

    const res = await client(bartek).groups.$post({ json: { ...input, name: 'Przejęta' } });
    expect(res.status).toBe(409);
    expect(await parseResponse(client(bartek).groups.$get())).toEqual([]);
  });

  it('lists only my groups, most recent activity first', async () => {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const first = newGroup({ name: 'Mieszkanie' });
    const second = newGroup({ name: 'Mazury' });
    await client(ania).groups.$post({ json: first });
    await client(ania).groups.$post({ json: second });
    await client(bartek).groups.$post({ json: newGroup({ name: 'Bartka' }) });

    const list = await parseResponse(client(ania).groups.$get());
    expect(list.map((g) => g.name)).toEqual(['Mazury', 'Mieszkanie']);
    expect(list[0]).toMatchObject({ ...second, simplifyDebts: true, archivedAt: null });
    expect(list[0]?.lastActivityAt).toEqual(expect.any(String));
  });

  it('tells each member when someone else last added an entry (the inbox unread marker)', async () => {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = newGroup();
    const { ownerMemberId } = await parseResponse(client(ania).groups.$post({ json: group }));
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const expense = (payer: string, title: string) => ({
      kind: 'expense' as const,
      id: randomUUID(),
      date: '2026-07-11',
      title,
      amount: 10_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'food' as const,
      receiptPhotoId: null,
      payers: [{ memberId: payer, amount: 10_000 }],
      split: { mode: 'equal' as const, memberIds: [payer] },
    });
    const add = (session: typeof ania, payer: string, title: string) =>
      parseResponse(client(session).groups[':groupId'].entries.$post({ param: { groupId: group.id }, json: expense(payer, title) }));
    const inboxRow = async (session: typeof ania) =>
      (await parseResponse(client(session).groups.$get())).find((g) => g.id === group.id)!;

    expect((await inboxRow(ania)).lastEntryByOthersAt).toBeNull();

    const pizza = await add(bartek, bartekId, 'Pizza');
    // My own entries, even newer ones, never count.
    const mine = await add(ania, ownerMemberId, 'Lody');
    expect((await inboxRow(ania)).lastEntryByOthersAt).toBe(pizza.createdAt);
    expect((await inboxRow(bartek)).lastEntryByOthersAt).toBe(mine.createdAt);

    // A deleted entry no longer counts.
    await client(bartek).groups[':groupId'].entries[':entryId'].$delete({
      param: { groupId: group.id, entryId: pizza.id },
      query: { baseVersion: String(pizza.version) },
    });
    expect((await inboxRow(ania)).lastEntryByOthersAt).toBeNull();
  });

  it("gives no access to other users' groups", async () => {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const input = newGroup();
    await client(ania).groups.$post({ json: input });

    const res = await client(bartek).groups[':groupId'].$get({ param: { groupId: input.id } });
    expect(res.status).toBe(404);
    const unknown = await client(bartek).groups[':groupId'].$get({ param: { groupId: randomUUID() } });
    expect(unknown.status).toBe(404);
    const invalid = await client(bartek).groups[':groupId'].$get({ param: { groupId: 'nope' } });
    expect(invalid.status).toBe(404);
  });

  it('requires a session', async () => {
    expect((await client().groups.$get()).status).toBe(401);
    expect((await client().groups.$post({ json: newGroup() })).status).toBe(401);
    expect((await client().groups[':groupId'].$get({ param: { groupId: randomUUID() } })).status).toBe(401);
  });
});
