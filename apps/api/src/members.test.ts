import { randomUUID } from 'node:crypto';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';
import { testDb } from '../test/db';
import { members } from './db/schema';

const newGroup = () => ({
  id: randomUUID(),
  name: 'Mazury',
  emoji: '⛵',
  color: '#1E88E5',
  baseCurrency: 'PLN',
  startDate: '2026-07-10',
  endDate: '2026-07-14',
});

describe('members', () => {
  const { app, signIn, client } = createTestApp();

  /** Ania's group. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const api = (session: { cookie: string }) => client(session).groups[':groupId'].members;
    const detail = async (session = ania) =>
      parseResponse(client(session).groups[':groupId'].$get({ param: { groupId: group.id } }));
    return { ania, group, api, detail };
  }

  /**
   * Makes a user a member of the group. Joining via the group link is a later
   * slice, so the test seeds the row directly.
   */
  async function addAccountMember(groupId: string, userId: string, displayName: string) {
    const id = randomUUID();
    await testDb.db.insert(members).values({ id, groupId, userId, displayName });
    return id;
  }

  it('adds a member without an account', async () => {
    const { ania, group, api, detail } = await setup();
    const id = randomUUID();

    const res = await api(ania).$post({ param: { groupId: group.id }, json: { id, displayName: ' Tomek ' } });
    expect(res.status).toBe(201);
    const tomek = { id, groupId: group.id, displayName: 'Tomek', userId: null, attendance: null };
    expect(await res.json()).toEqual(tomek);

    expect((await detail()).members).toEqual([expect.objectContaining({ userId: ania.userId }), tomek]);
  });

  it('stores attendance in the canonical shape and rejects anything else', async () => {
    const { ania, group, api, detail } = await setup();
    const attendance = [
      { from: '2026-07-10', to: '2026-07-11' },
      { from: '2026-07-13', to: '2026-07-14' },
    ];
    const id = randomUUID();
    const res = await api(ania).$post({ param: { groupId: group.id }, json: { id, displayName: 'Zosia', attendance } });
    expect(res.status).toBe(201);
    expect((await detail()).members.find((m) => m.id === id)?.attendance).toEqual(attendance);

    const touching = [
      { from: '2026-07-10', to: '2026-07-11' },
      { from: '2026-07-12', to: '2026-07-14' },
    ];
    const bad = await api(ania).$post({
      param: { groupId: group.id },
      json: { id: randomUUID(), displayName: 'Kasia', attendance: touching },
    });
    expect(bad.status).toBe(400);
    expect((await detail()).members).toHaveLength(2);
  });

  it('validates the name', async () => {
    const { ania, group, api } = await setup();
    for (const displayName of ['', '   ', 'x'.repeat(61)]) {
      const res = await api(ania).$post({ param: { groupId: group.id }, json: { id: randomUUID(), displayName } });
      expect(res.status, displayName).toBe(400);
    }
  });

  it('repeating the same add does not duplicate the member; an id taken elsewhere is a conflict', async () => {
    const { ania, group, api, detail } = await setup();
    const input = { id: randomUUID(), displayName: 'Tomek' };
    expect((await api(ania).$post({ param: { groupId: group.id }, json: input })).status).toBe(201);
    const again = await api(ania).$post({ param: { groupId: group.id }, json: input });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject(input);
    expect((await detail()).members).toHaveLength(2);

    const other = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const taken = await api(ania).$post({ param: { groupId: other.id }, json: input });
    expect(taken.status).toBe(409);
  });

  it('any member renames a member without an account', async () => {
    const { ania, group, api, detail } = await setup();
    const bartek = await signIn('bartek@example.com');
    await addAccountMember(group.id, bartek.userId, 'Bartek');
    const id = randomUUID();
    await api(ania).$post({ param: { groupId: group.id }, json: { id, displayName: 'Tomek' } });

    const res = await api(bartek)[':memberId'].$patch({
      param: { groupId: group.id, memberId: id },
      json: { displayName: ' Tomasz ' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, displayName: 'Tomasz', userId: null });
    expect((await detail()).members.find((m) => m.id === id)?.displayName).toBe('Tomasz');
  });

  it("members with an account can't be renamed by others, only by themselves", async () => {
    const { ania, group, api, detail } = await setup();
    const bartek = await signIn('bartek@example.com');
    const bartekMemberId = await addAccountMember(group.id, bartek.userId, 'Bartek');

    const byOther = await api(ania)[':memberId'].$patch({
      param: { groupId: group.id, memberId: bartekMemberId },
      json: { displayName: 'Bartuś' },
    });
    expect(byOther.status).toBe(403);
    expect(await byOther.json()).toEqual({ error: 'forbidden' });

    const bySelf = await api(bartek)[':memberId'].$patch({
      param: { groupId: group.id, memberId: bartekMemberId },
      json: { displayName: 'Bartłomiej' },
    });
    expect(bySelf.status).toBe(200);
    expect((await detail()).members.find((m) => m.id === bartekMemberId)?.displayName).toBe('Bartłomiej');
  });

  it('rejects changes from non-members of the group', async () => {
    const { ania, group, api, detail } = await setup();
    const id = randomUUID();
    await api(ania).$post({ param: { groupId: group.id }, json: { id, displayName: 'Tomek' } });
    const obcy = await signIn('obcy@example.com');

    const add = await api(obcy).$post({ param: { groupId: group.id }, json: { id: randomUUID(), displayName: 'X' } });
    expect(add.status).toBe(404);
    const rename = await api(obcy)[':memberId'].$patch({
      param: { groupId: group.id, memberId: id },
      json: { displayName: 'X' },
    });
    expect(rename.status).toBe(404);
    expect((await detail()).members.map((m) => m.displayName)).toEqual(['ania', 'Tomek']);
  });

  it('answers 404 for a member of another group or an unknown member', async () => {
    const { ania, group, api } = await setup();
    const other = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const id = randomUUID();
    await api(ania).$post({ param: { groupId: other.id }, json: { id, displayName: 'Tomek' } });

    for (const memberId of [id, randomUUID(), 'nope']) {
      const res = await api(ania)[':memberId'].$patch({
        param: { groupId: group.id, memberId },
        json: { displayName: 'X' },
      });
      expect(res.status, memberId).toBe(404);
    }
  });

  it('requires a session', async () => {
    const groupId = randomUUID();
    const add = await app.request(`/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: randomUUID(), displayName: 'Tomek' }),
    });
    expect(add.status).toBe(401);
    const rename = await app.request(`/groups/${groupId}/members/${randomUUID()}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Tomek' }),
    });
    expect(rename.status).toBe(401);
  });
});
