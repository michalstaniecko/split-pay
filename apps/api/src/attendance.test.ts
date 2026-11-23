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

const leaveAndReturn = [
  { from: '2026-07-10', to: '2026-07-11' },
  { from: '2026-07-13', to: '2026-07-14' },
];

describe('member attendance', () => {
  const { app, signIn, client } = createTestApp();

  /** Ania's trip with Tomek, a member without an account. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const tomek = randomUUID();
    await client(ania).groups[':groupId'].members.$post({
      param: { groupId: group.id },
      json: { id: tomek, displayName: 'Tomek' },
    });
    const attendance = (session: { cookie: string }) =>
      client(session).groups[':groupId'].members[':memberId'].attendance;
    const detail = async (session = ania) =>
      parseResponse(client(session).groups[':groupId'].$get({ param: { groupId: group.id } }));
    return { ania, group, tomek, attendance, detail };
  }

  it('saves canonical attendance with gaps, and null for the whole trip', async () => {
    const { ania, group, tomek, attendance, detail } = await setup();

    const res = await attendance(ania).$put({
      param: { groupId: group.id, memberId: tomek },
      json: { attendance: leaveAndReturn },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: tomek, attendance: leaveAndReturn });
    expect((await detail()).members.find((m) => m.id === tomek)?.attendance).toEqual(leaveAndReturn);

    const whole = await attendance(ania).$put({ param: { groupId: group.id, memberId: tomek }, json: { attendance: null } });
    expect(whole.status).toBe(200);
    expect((await detail()).members.find((m) => m.id === tomek)?.attendance).toBeNull();
  });

  it('rejects non-canonical or empty attendance', async () => {
    const { ania, group, tomek, attendance, detail } = await setup();
    const touching = [
      { from: '2026-07-10', to: '2026-07-11' },
      { from: '2026-07-12', to: '2026-07-14' },
    ];
    for (const bad of [touching, []]) {
      const res = await attendance(ania).$put({ param: { groupId: group.id, memberId: tomek }, json: { attendance: bad } });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await detail()).members.find((m) => m.id === tomek)?.attendance).toBeNull();
  });

  it("any member edits anyone's attendance, including members with an account (ADR-0008)", async () => {
    const { ania, group, attendance, detail } = await setup();
    const bartek = await signIn('bartek@example.com');
    await testDb.db.insert(members).values({ id: randomUUID(), groupId: group.id, userId: bartek.userId, displayName: 'Bartek' });
    const aniaMemberId = group.ownerMemberId;

    const res = await attendance(bartek).$put({
      param: { groupId: group.id, memberId: aniaMemberId },
      json: { attendance: leaveAndReturn },
    });
    expect(res.status).toBe(200);
    expect((await detail(ania)).members.find((m) => m.id === aniaMemberId)?.attendance).toEqual(leaveAndReturn);
  });

  it('answers 404 to non-members and for unknown members or members of another group', async () => {
    const { ania, group, tomek, attendance } = await setup();
    const obcy = await signIn('obcy@example.com');
    const json = { attendance: null };
    expect((await attendance(obcy).$put({ param: { groupId: group.id, memberId: tomek }, json })).status).toBe(404);

    const other = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    for (const memberId of [other.ownerMemberId, randomUUID(), 'nope']) {
      const res = await attendance(ania).$put({ param: { groupId: group.id, memberId }, json });
      expect(res.status, memberId).toBe(404);
    }
  });

  it('requires a session', async () => {
    const res = await app.request(`/groups/${randomUUID()}/members/${randomUUID()}/attendance`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attendance: null }),
    });
    expect(res.status).toBe(401);
  });

  // Entries arrive with #8. Once they exist: create an expense with default
  // participants, change attendance, assert the entry's split/memberIds and
  // version are unchanged (ADR-0016 snapshot rule).
  it.todo('changing attendance does not modify existing entries');
});
