import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('balances and settle-up', () => {
  const { signIn, client } = createTestApp();

  /**
   * Ania's group with Bartek (joined via the link) and Tomek and Kasia
   * (members without an account). A chain of debts: Ania paid 100 for
   * Bartek, Bartek paid 100 for Tomek; Kasia took part in nothing.
   */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mieszkanie', emoji: '🏠', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const addMember = (displayName: string) =>
      parseResponse(
        client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName } }),
      );
    const tomek = await addMember('Tomek');
    const kasia = await addMember('Kasia');
    const aniaId = group.ownerMemberId;

    const pay = (payer: string, consumer: string, amount: number): NewEntry => ({
      kind: 'expense',
      id: randomUUID(),
      date: '2026-07-11',
      title: 'Zakupy',
      amount,
      currency: 'PLN',
      rateToBase: '1',
      category: 'groceries',
      receiptPhotoId: null,
      payers: [{ memberId: payer, amount }],
      split: { mode: 'equal', memberIds: [consumer] },
    });
    for (const entry of [pay(aniaId, bartekId, 10_000), pay(bartekId, tomek.id, 10_000)]) {
      await parseResponse(client(ania).groups[':groupId'].entries.$post({ param: { groupId }, json: entry }));
    }
    const balances = (session = ania) => client(session).groups[':groupId'].balances.$get({ param: { groupId } });
    const setSimplify = (simplifyDebts: boolean, session = ania) =>
      client(session).groups[':groupId'].settings.$patch({ param: { groupId }, json: { simplifyDebts } });
    return { ania, bartek, groupId, aniaId, bartekId, tomekId: tomek.id, kasiaId: kasia.id, balances, setSimplify };
  }

  it("returns every member's balance and simplified transfers by default", async () => {
    const { aniaId, bartekId, tomekId, kasiaId, balances, bartek } = await setup();

    const res = await balances(bartek);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      baseCurrency: 'PLN',
      simplifyDebts: true,
      balances: [
        { memberId: aniaId, amount: 10_000 },
        { memberId: bartekId, amount: 0 },
        { memberId: tomekId, amount: -10_000 },
        { memberId: kasiaId, amount: 0 },
      ],
      transfers: [{ from: tomekId, to: aniaId, amount: 10_000 }],
    });
  });

  it('suggests pairwise transfers once debt simplification is turned off in the settings', async () => {
    const { aniaId, bartekId, tomekId, balances, setSimplify, bartek } = await setup();

    const res = await setSimplify(false, bartek);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ simplifyDebts: false });

    const body = await parseResponse(balances());
    expect(body.simplifyDebts).toBe(false);
    // Pairwise transfers are ordered by member id (random UUIDs here).
    expect(body.transfers).toHaveLength(2);
    expect(body.transfers).toEqual(
      expect.arrayContaining([
        { from: bartekId, to: aniaId, amount: 10_000 },
        { from: tomekId, to: bartekId, amount: 10_000 },
      ]),
    );
  });

  it('only members see balances or change settings', async () => {
    const { groupId } = await setup();
    const cezary = await signIn('cezary@example.com');

    const res = await client(cezary).groups[':groupId'].balances.$get({ param: { groupId } });
    expect(res.status).toBe(404);
    const patch = await client(cezary).groups[':groupId'].settings.$patch({
      param: { groupId },
      json: { simplifyDebts: false },
    });
    expect(patch.status).toBe(404);
    expect((await client().groups[':groupId'].balances.$get({ param: { groupId } })).status).toBe(401);
  });
});

describe('payout details', () => {
  const { signIn, client } = createTestApp();

  it('are empty until filled in, and can be changed and cleared in the profile', async () => {
    const ania = await signIn('ania@example.com');
    const mine = client(ania).me['payout-details'];

    expect(await parseResponse(mine.$get())).toEqual({ bankAccount: null, blikPhone: null });

    const res = await mine.$put({ json: { bankAccount: '61 1090 1014 0000 0712 1981 2874', blikPhone: '600 700 800' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bankAccount: '61109010140000071219812874', blikPhone: '600700800' });
    expect(await parseResponse(mine.$get())).toEqual({ bankAccount: '61109010140000071219812874', blikPhone: '600700800' });

    await parseResponse(mine.$put({ json: { bankAccount: '', blikPhone: '600700800' } }));
    expect(await parseResponse(mine.$get())).toEqual({ bankAccount: null, blikPhone: '600700800' });

    expect((await mine.$put({ json: { bankAccount: 'abc', blikPhone: null } })).status).toBe(400);
  });

  it("are visible only to members of a group shared with their owner", async () => {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const cezary = await signIn('cezary@example.com');
    await parseResponse(client(ania).me['payout-details'].$put({ json: { bankAccount: null, blikPhone: '600700800' } }));

    // Ania's group with Bartek; Cezary has his own group and is not in Ania's.
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Wyjazd', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }),
    );
    const payoutOf = (session: { cookie: string }, memberId: string) =>
      client(session).groups[':groupId'].members[':memberId']['payout-details'].$get({ param: { groupId, memberId } });

    const seenByBartek = await payoutOf(bartek, group.ownerMemberId);
    expect(seenByBartek.status).toBe(200);
    expect(await seenByBartek.json()).toEqual({ bankAccount: null, blikPhone: '600700800' });

    // Not a member of the group → as if it did not exist.
    expect((await payoutOf(cezary, group.ownerMemberId)).status).toBe(404);
    // A member without an account has no payout details.
    expect(await parseResponse(payoutOf(bartek, tomek.id))).toEqual({ bankAccount: null, blikPhone: null });
    // Unknown member of the group.
    expect((await payoutOf(bartek, randomUUID())).status).toBe(404);
  });
});
