import { randomUUID } from 'node:crypto';
import type { ActivityPage, NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('activity feed', () => {
  const { signIn, client } = createTestApp();

  async function createGroup(session: { cookie: string }, name: string, emoji = '⛵') {
    return parseResponse(
      client(session).groups.$post({
        json: {
          id: randomUUID(),
          name,
          emoji,
          color: '#1E88E5',
          baseCurrency: 'PLN',
          startDate: null,
          endDate: null,
        },
      }),
    );
  }

  const expense = (payer: string, title: string): NewEntry => ({
    kind: 'expense',
    id: randomUUID(),
    date: '2026-07-11',
    title,
    amount: 10_000,
    currency: 'PLN',
    rateToBase: '1',
    category: 'food',
    receiptPhotoId: null,
    payers: [{ memberId: payer, amount: 10_000 }],
    split: { mode: 'equal', memberIds: [payer] },
  });

  const activity = async (session: { cookie: string }, query: { cursor?: string; limit?: string } = {}) =>
    (await parseResponse(client(session).activity.$get({ query }))) as ActivityPage;

  it('lists changes from all my groups, newest first, with the group and member names', async () => {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const mazury = await createGroup(ania, 'Mazury');
    const flat = await createGroup(ania, 'Mieszkanie', '🏠');
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: mazury.id } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    await parseResponse(
      client(bartek).groups[':groupId'].entries.$post({
        param: { groupId: mazury.id },
        json: expense(bartekId, 'Pizza'),
      }),
    );

    const page = await activity(ania);
    expect(page.items.map((i) => [i.kind, i.group.name, i.byMe])).toEqual([
      ['entry.create', 'Mazury', false],
      ['member.join', 'Mazury', false],
      ['group.create', 'Mieszkanie', true],
      ['group.create', 'Mazury', true],
    ]);
    expect(page.items[0]).toMatchObject({
      groupId: mazury.id,
      group: { id: mazury.id, name: 'Mazury', emoji: '⛵', color: '#1E88E5' },
      actorMemberId: bartekId,
      undoneByChangeId: null,
    });
    expect(page.items[2]!.group).toMatchObject({ id: flat.id, emoji: '🏠' });
    expect(page.memberNames).toMatchObject({ [bartekId]: 'bartek', [mazury.ownerMemberId]: 'ania' });
    expect(page.nextCursor).toBeNull();

    // Bartek sees only Mazury; for him Ania's group creation is by someone else.
    const his = await activity(bartek);
    expect(his.items.map((i) => [i.kind, i.byMe])).toEqual([
      ['entry.create', true],
      ['member.join', true],
      ['group.create', false],
    ]);
  });

  it('only shows groups the user belongs to', async () => {
    const ania = await signIn('ania@example.com');
    const celina = await signIn('celina@example.com');
    const mine = await createGroup(ania, 'Mazury');
    const theirs = await createGroup(celina, 'Tatry');
    await parseResponse(
      client(celina).groups[':groupId'].entries.$post({
        param: { groupId: theirs.id },
        json: expense(theirs.ownerMemberId, 'Schronisko'),
      }),
    );

    const page = await activity(ania);
    expect(page.items.map((i) => i.groupId)).toEqual([mine.id]);
    expect(Object.keys(page.memberNames)).toEqual([mine.ownerMemberId]);

    // A user without groups has an empty feed.
    const darek = await signIn('darek@example.com');
    expect(await activity(darek)).toEqual({ items: [], memberNames: {}, nextCursor: null });
  });

  it('stops showing a group after leaving it', async () => {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await createGroup(ania, 'Mazury');
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    expect((await activity(bartek)).items).toHaveLength(2);

    await parseResponse(client(bartek).groups[':groupId'].leave.$post({ param: { groupId: group.id } }));
    expect((await activity(bartek)).items).toEqual([]);
  });

  it('pages with a cursor', async () => {
    const ania = await signIn('ania@example.com');
    const group = await createGroup(ania, 'Mazury');
    for (const title of ['A', 'B', 'C', 'D']) {
      await parseResponse(
        client(ania).groups[':groupId'].entries.$post({
          param: { groupId: group.id },
          json: expense(group.ownerMemberId, title),
        }),
      );
    }
    const titles = (page: ActivityPage) =>
      page.items.map((i) => (i.kind === 'entry.create' && i.after.kind !== 'settlement' ? i.after.title : i.kind));

    const first = await activity(ania, { limit: '2' });
    expect(titles(first)).toEqual(['D', 'C']);
    expect(first.nextCursor).not.toBeNull();
    const second = await activity(ania, { limit: '2', cursor: first.nextCursor! });
    expect(titles(second)).toEqual(['B', 'A']);
    const third = await activity(ania, { limit: '2', cursor: second.nextCursor! });
    expect(titles(third)).toEqual(['group.create']);
    expect(third.nextCursor).toBeNull();
  });

  it('marks undone changes and rejects bad queries', async () => {
    const ania = await signIn('ania@example.com');
    const group = await createGroup(ania, 'Mazury');
    const entry = await parseResponse(
      client(ania).groups[':groupId'].entries.$post({
        param: { groupId: group.id },
        json: expense(group.ownerMemberId, 'Pizza'),
      }),
    );
    const [created] = (await activity(ania)).items;
    expect(created!.targetId).toBe(entry.id);
    const undo = await parseResponse(
      client(ania).groups[':groupId'].changes[':changeId'].undo.$post({
        param: { groupId: group.id, changeId: created!.id },
      }),
    );
    const page = await activity(ania);
    expect(page.items[0]).toMatchObject({ id: undo.id, undoesChangeId: created!.id });
    expect(page.items[1]).toMatchObject({ id: created!.id, undoneByChangeId: undo.id });

    expect((await client(ania).activity.$get({ query: { cursor: 'abc' } })).status).toBe(400);
    expect((await client(ania).activity.$get({ query: { limit: '0' } })).status).toBe(400);
    expect((await client().activity.$get({ query: {} })).status).toBe(401);
  });

  it("tells when someone else last changed something (the bell's unread dot)", async () => {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const latest = async (session: { cookie: string }) => parseResponse(client(session).activity.latest.$get());

    const group = await createGroup(ania, 'Mazury');
    // Only Ania's own changes so far.
    expect(await latest(ania)).toEqual({ latestByOthersAt: null });

    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    await parseResponse(
      client(ania).groups[':groupId'].entries.$post({
        param: { groupId: group.id },
        json: expense(group.ownerMemberId, 'Pizza'),
      }),
    );
    const [mine, join] = (await activity(ania)).items;
    expect(mine!.byMe).toBe(true);
    expect(await latest(ania)).toEqual({ latestByOthersAt: join!.createdAt });
    expect(await latest(bartek)).toEqual({ latestByOthersAt: mine!.createdAt });

    // A user without groups: nothing.
    expect(await latest(await signIn('celina@example.com'))).toEqual({ latestByOthersAt: null });
    expect((await client().activity.latest.$get()).status).toBe(401);
  });
});
