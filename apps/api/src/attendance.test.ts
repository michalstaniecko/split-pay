import { randomUUID } from 'node:crypto';
import { defaultParticipants, equalExpenseDefaults } from '@split-pay/shared';
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
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
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

  it('changing attendance does not modify existing entries (ADR-0016)', async () => {
    const { ania, group, tomek, attendance, detail } = await setup();
    const entries = client(ania).groups[':groupId'].entries;
    // Tomek is present on the 12th (whole trip), so the default participants include him.
    const expense = equalExpenseDefaults({
      id: randomUUID(),
      title: 'Pizza',
      amount: 12_000,
      currency: 'PLN',
      date: '2026-07-12',
      payerMemberId: group.ownerMemberId,
      members: (await detail()).members,
    });
    expect(expense.split).toEqual({ mode: 'equal', memberIds: expect.arrayContaining([group.ownerMemberId, tomek]) });
    const created = await parseResponse(entries.$post({ param: { groupId: group.id }, json: expense }));

    // Tomek leaves on the 12th: new expenses that day would skip him…
    await parseResponse(
      attendance(ania).$put({ param: { groupId: group.id, memberId: tomek }, json: { attendance: leaveAndReturn } }),
    );
    expect(defaultParticipants((await detail()).members, '2026-07-12')).toEqual([group.ownerMemberId]);

    // …but the existing entry keeps its snapshot of participants and its version.
    const [after] = await parseResponse(entries.$get({ param: { groupId: group.id } }));
    expect(after).toEqual(created);
  });
});
