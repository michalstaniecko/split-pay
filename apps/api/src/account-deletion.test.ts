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

describe('account deletion (ADR-0010)', () => {
  const { app, signIn, client } = createTestApp();

  const linkToken = async (groupId: string, session: Session) =>
    (await parseResponse(client(session).groups[':groupId'].link.$get({ param: { groupId } }))).token;

  const detail = (groupId: string, session: Session) =>
    parseResponse(client(session).groups[':groupId'].$get({ param: { groupId } }));

  const deleteAccount = (session: Session, locale = 'pl') => client(session).me.$delete({ json: { locale } });

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

  it('turns the member into "Usunięty użytkownik" without an account, keeping entries and balances', async () => {
    const { ania, bartek, groupId, bartekMemberId, entries } = await setup();
    const entriesBefore = await entries();
    const balancesBefore = computeBalances(entriesBefore, 'PLN');
    expect(balancesBefore.get(bartekMemberId)).toBe(6_000);

    const res = await deleteAccount(bartek);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    const members = (await detail(groupId, ania)).members;
    expect(members).toHaveLength(3);
    expect(members.find((m) => m.id === bartekMemberId)).toMatchObject({
      displayName: 'Usunięty użytkownik',
      userId: null,
    });
    const entriesAfter = await entries();
    expect(entriesAfter).toEqual(entriesBefore);
    expect(computeBalances(entriesAfter, 'PLN')).toEqual(balancesBefore);
  });

  it('uses the deleting user’s language for the name', async () => {
    const { ania, bartek, groupId, bartekMemberId } = await setup();

    await deleteAccount(bartek, 'en');

    const members = (await detail(groupId, ania)).members;
    expect(members.find((m) => m.id === bartekMemberId)?.displayName).toBe('Deleted user');
  });

  it('applies to every group of the user', async () => {
    const { ania, bartek } = await setup();
    const own = await parseResponse(client(bartek).groups.$post({ json: newGroup('Mieszkanie') }));
    const ownMemberToken = await linkToken(own.id, bartek);
    await parseResponse(client(ania).links[':token'].join.$post({ param: { token: ownMemberToken } }));

    await parseResponse(deleteAccount(bartek));

    const groups = await parseResponse(client(ania).groups.$get());
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      const members = (await detail(g.id, ania)).members;
      const deleted = members.filter((m) => m.displayName === 'Usunięty użytkownik');
      expect(deleted).toHaveLength(1);
      expect(deleted[0]?.userId).toBeNull();
    }
    expect(
      (await detail(own.id, ania)).members.find((m) => m.id === own.ownerMemberId)?.displayName,
    ).toBe('Usunięty użytkownik');
  });

  it('removes sessions and the email: the old session is rejected and the email signs up a fresh account', async () => {
    const { bartek } = await setup();

    await parseResponse(deleteAccount(bartek));

    expect((await client(bartek).me.$get()).status).toBe(401);
    const again = await signIn('bartek@example.com');
    expect(again.userId).not.toBe(bartek.userId);
    expect(await parseResponse(client(again).groups.$get())).toEqual([]);
  });

  it('removes the claimer name from claims the user made', async () => {
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

    await parseResponse(deleteAccount(tomasz));

    const claims = await parseResponse(client(ania).groups[':groupId'].claims.$get({ param: { groupId } }));
    expect(claims).toEqual([
      expect.objectContaining({ memberId: tomek.id, memberName: 'Usunięty użytkownik', userId: null, claimerName: 'Usunięty użytkownik' }),
    ]);
    expect(JSON.stringify(claims)).not.toContain('tomasz');
  });

  it('the deleted user can be renamed by any member and claimed like any member without an account', async () => {
    const { ania, bartek, groupId, bartekMemberId } = await setup();
    await parseResponse(deleteAccount(bartek));

    const renamed = await client(ania).groups[':groupId'].members[':memberId'].$patch({
      param: { groupId, memberId: bartekMemberId },
      json: { displayName: 'Bartek' },
    });
    expect(renamed.status).toBe(200);

    const bartekAgain = await signIn('bartek@example.com');
    const token = await linkToken(groupId, ania);
    const preview = await parseResponse(client(bartekAgain).links[':token'].$get({ param: { token } }));
    expect(preview.claimable).toContainEqual({ id: bartekMemberId, displayName: 'Bartek' });
    const claimed = await client(bartekAgain).links[':token'].claim.$post({ param: { token }, json: { memberId: bartekMemberId } });
    expect(claimed.status).toBe(201);
    expect((await detail(groupId, bartekAgain)).members.find((m) => m.id === bartekMemberId)?.userId).toBe(
      bartekAgain.userId,
    );
  });

  it('requires a session and a language', async () => {
    expect((await client().me.$delete({ json: { locale: 'pl' } })).status).toBe(401);
    const ania = await signIn('ania@example.com');
    const res = await app.request('/me', {
      method: 'DELETE',
      headers: { cookie: ania.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect((await client(ania).me.$get()).status).toBe(200);
  });
});
