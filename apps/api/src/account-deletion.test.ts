import { randomUUID } from 'node:crypto';
import { computeBalances, type NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

const newGroup = (name = 'Mazury') => ({
  id: randomUUID(),
  name,
  emoji: '⛵',
  color: '#1E88E5',
  baseCurrency: 'PLN',
  startDate: '2026-07-10',
  endDate: '2026-07-14',
});

type Session = { cookie: string; userId: string };

describe('account deletion (ADR-0010, ADR-0019)', () => {
  const { app, signIn, client } = createTestApp();

  const linkToken = async (groupId: string, session: Session) =>
    (await parseResponse(client(session).groups[':groupId'].link.$get({ param: { groupId } }))).token;

  const detail = (groupId: string, session: Session) =>
    parseResponse(client(session).groups[':groupId'].$get({ param: { groupId } }));

  const deleteAccount = (session: Session, choice: { removeName?: boolean } = {}) =>
    client(session).me.$delete({ json: choice });

  /**
   * Ania's trip which Bartek joined through the group link, with Tomek
   * (member without an account) and one expense Bartek paid for everybody.
   */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const groupId = group.id;
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }),
    );
    const { memberId: bartekMemberId } = await parseResponse(
      client(bartek).links[':token'].join.$post({ param: { token: await linkToken(groupId, ania) } }),
    );
    const everyone = [group.ownerMemberId, tomek.id, bartekMemberId];
    const expense: NewEntry = {
      kind: 'expense',
      id: randomUUID(),
      date: '2026-07-11',
      title: 'Pizza',
      amount: 9_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'food',
      receiptPhotoId: null,
      payers: [{ memberId: bartekMemberId, amount: 9_000 }],
      split: { mode: 'equal', memberIds: everyone },
    };
    await parseResponse(client(bartek).groups[':groupId'].entries.$post({ param: { groupId }, json: expense }));
    const entries = () => parseResponse(client(ania).groups[':groupId'].entries.$get({ param: { groupId } }));
    return { ania, bartek, groupId, tomek, bartekMemberId, entries };
  }

  it('keeps the member’s last name by default, without an account, with entries and balances untouched (ADR-0019)', async () => {
    const { ania, bartek, groupId, bartekMemberId, entries } = await setup();
    const entriesBefore = await entries();
    const balancesBefore = computeBalances(entriesBefore, 'PLN');
    expect(balancesBefore.get(bartekMemberId)).toBe(6_000);

    const res = await deleteAccount(bartek);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    const members = (await detail(groupId, ania)).members;
    expect(members).toHaveLength(3);
    expect(members.find((m) => m.id === bartekMemberId)).toMatchObject({ displayName: 'bartek', userId: null });
    const entriesAfter = await entries();
    expect(entriesAfter).toEqual(entriesBefore);
    expect(computeBalances(entriesAfter, 'PLN')).toEqual(balancesBefore);
  });

  it('removes the name too when asked: a marker (null) every viewer names in their own language', async () => {
    const { ania, bartek, groupId, bartekMemberId, entries } = await setup();
    const entriesBefore = await entries();

    expect((await deleteAccount(bartek, { removeName: true })).status).toBe(200);

    const members = (await detail(groupId, ania)).members;
    expect(members.find((m) => m.id === bartekMemberId)).toMatchObject({ displayName: null, userId: null });
    expect(await entries()).toEqual(entriesBefore);
    const pub = await parseResponse(client().public.links[':token'].$get({ param: { token: await linkToken(groupId, ania) } }));
    expect(pub.members.find((m) => m.id === bartekMemberId)?.displayName).toBeNull();
  });

  it('applies to every group of the user', async () => {
    const { ania, bartek } = await setup();
    const own = await parseResponse(client(bartek).groups.$post({ json: newGroup('Mieszkanie') }));
    await parseResponse(client(ania).links[':token'].join.$post({ param: { token: await linkToken(own.id, bartek) } }));

    await parseResponse(deleteAccount(bartek, { removeName: true }));

    const groups = await parseResponse(client(ania).groups.$get());
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      const members = (await detail(g.id, ania)).members;
      const deleted = members.filter((m) => m.displayName === null);
      expect(deleted).toHaveLength(1);
      expect(deleted[0]?.userId).toBeNull();
    }
    expect((await detail(own.id, ania)).members.find((m) => m.id === own.ownerMemberId)?.displayName).toBeNull();
  });

  it('removes sessions, the email and payout details: the email signs up a fresh account', async () => {
    const { ania, bartek, groupId, bartekMemberId } = await setup();
    await parseResponse(client(bartek).me['payout-details'].$put({ json: { bankAccount: null, blikPhone: '600700800' } }));

    await parseResponse(deleteAccount(bartek));

    expect((await client(bartek).me.$get()).status).toBe(401);
    const payout = client(ania).groups[':groupId'].members[':memberId']['payout-details'].$get({
      param: { groupId, memberId: bartekMemberId },
    });
    expect(await parseResponse(payout)).toEqual({ bankAccount: null, blikPhone: null });
    const again = await signIn('bartek@example.com');
    expect(again.userId).not.toBe(bartek.userId);
    expect(await parseResponse(client(again).groups.$get())).toEqual([]);
    expect(await parseResponse(client(again).me['payout-details'].$get())).toEqual({ bankAccount: null, blikPhone: null });
  });

  async function claimedByTomasz() {
    const ania = await signIn('ania@example.com');
    const group = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const groupId = group.id;
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }),
    );
    const tomasz = await signIn('tomasz@example.com');
    await parseResponse(
      client(tomasz).links[':token'].claim.$post({ param: { token: await linkToken(groupId, ania) }, json: { memberId: tomek.id } }),
    );
    const claims = () => parseResponse(client(ania).groups[':groupId'].claims.$get({ param: { groupId } }));
    return { ania, groupId, tomek, tomasz, claims };
  }

  it('keeps the claim message’s names by default, without the account', async () => {
    const { tomek, tomasz, claims } = await claimedByTomasz();

    await parseResponse(deleteAccount(tomasz));

    expect(await claims()).toEqual([
      expect.objectContaining({ memberId: tomek.id, memberName: 'Tomek', userId: null, claimerName: 'tomasz' }),
    ]);
  });

  it('removes the claimer name from claims the user made when the name is removed', async () => {
    const { tomek, tomasz, claims } = await claimedByTomasz();

    await parseResponse(deleteAccount(tomasz, { removeName: true }));

    const after = await claims();
    expect(after).toEqual([expect.objectContaining({ memberId: tomek.id, memberName: null, userId: null, claimerName: null })]);
    expect(JSON.stringify(after)).not.toMatch(/tom/i);
  });

  for (const removeName of [false, true]) {
    it(`the member left behind can be renamed by anyone, claimed and the claim undone (removeName: ${removeName})`, async () => {
      const { ania, bartek, groupId, bartekMemberId } = await setup();
      await parseResponse(deleteAccount(bartek, { removeName }));

      const renamed = await client(ania).groups[':groupId'].members[':memberId'].$patch({
        param: { groupId, memberId: bartekMemberId },
        json: { displayName: 'Bartek' },
      });
      expect(renamed.status).toBe(200);
      expect((await detail(groupId, ania)).members.find((m) => m.id === bartekMemberId)?.displayName).toBe('Bartek');

      const bartekAgain = await signIn('bartek@example.com');
      const token = await linkToken(groupId, ania);
      const preview = await parseResponse(client(bartekAgain).links[':token'].$get({ param: { token } }));
      expect(preview.claimable).toContainEqual({ id: bartekMemberId, displayName: 'Bartek' });
      const claimed = await client(bartekAgain).links[':token'].claim.$post({ param: { token }, json: { memberId: bartekMemberId } });
      expect(claimed.status).toBe(201);
      expect((await detail(groupId, bartekAgain)).members.find((m) => m.id === bartekMemberId)?.userId).toBe(
        bartekAgain.userId,
      );

      const [claim] = await parseResponse(client(ania).groups[':groupId'].claims.$get({ param: { groupId } }));
      const undone = await client(ania).groups[':groupId'].claims[':claimId'].undo.$post({
        param: { groupId, claimId: claim!.id },
      });
      expect(undone.status).toBe(200);
      expect((await detail(groupId, ania)).members.find((m) => m.id === bartekMemberId)?.userId).toBeNull();
    });
  }

  it('a member whose name was removed can be claimed as is', async () => {
    const { ania, bartek, groupId, bartekMemberId } = await setup();
    await parseResponse(deleteAccount(bartek, { removeName: true }));

    const bartekAgain = await signIn('bartek@example.com');
    const token = await linkToken(groupId, ania);
    const preview = await parseResponse(client(bartekAgain).links[':token'].$get({ param: { token } }));
    expect(preview.claimable).toContainEqual({ id: bartekMemberId, displayName: null });
    expect((await client(bartekAgain).links[':token'].claim.$post({ param: { token }, json: { memberId: bartekMemberId } })).status).toBe(201);
  });

  for (const removeName of [false, true]) {
    it(`"added by" still points at the member after deletion (removeName: ${removeName})`, async () => {
      const { ania, bartek, groupId, bartekMemberId, entries } = await setup();

      await parseResponse(deleteAccount(bartek, { removeName }));

      const [pizza] = await entries();
      expect(pizza?.createdByMember).toBe(bartekMemberId);
      const token = await linkToken(groupId, ania);
      const [publicPizza] = await parseResponse(client().public.links[':token'].entries.$get({ param: { token } }));
      expect(publicPizza?.createdByMember).toBe(bartekMemberId);
    });
  }

  it('rejects an invalid choice', async () => {
    const ania = await signIn('ania@example.com');
    const res = await app.request('/me', {
      method: 'DELETE',
      headers: { cookie: ania.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ removeName: 'yes' }),
    });
    expect(res.status).toBe(400);
    expect((await client(ania).me.$get()).status).toBe(200);
  });

  it('requires a session', async () => {
    expect((await client().me.$delete({ json: {} })).status).toBe(401);
  });
});
