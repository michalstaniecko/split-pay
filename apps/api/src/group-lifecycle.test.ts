import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('group lifecycle: archive, leave, delete', () => {
  const { app, signIn, client, json } = createTestApp();

  /** Ania's group (she is the owner) with Bartek joined via the link and Tomek without an account. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }),
    );
    const g = client(ania).groups[':groupId'];
    return { ania, bartek, groupId, token, aniaId: group.ownerMemberId, bartekId, tomekId: tomek.id, g };
  }

  const expense = (payer: string, consumer: string, amount: number): NewEntry => ({
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

  describe('archiving', () => {
    it('any member archives and unarchives the group', async () => {
      const { bartek, groupId } = await setup();
      const g = client(bartek).groups[':groupId'];

      const archived = await parseResponse(g.archive.$put({ param: { groupId } }));
      expect(archived.archivedAt).not.toBeNull();
      expect((await parseResponse(g.$get({ param: { groupId } }))).archivedAt).toBe(archived.archivedAt);

      const unarchived = await parseResponse(g.archive.$delete({ param: { groupId } }));
      expect(unarchived.archivedAt).toBeNull();
    });

    it('archiving twice keeps the original archive time', async () => {
      const { g, groupId } = await setup();
      const first = await parseResponse(g.archive.$put({ param: { groupId } }));
      const second = await parseResponse(g.archive.$put({ param: { groupId } }));
      expect(second.archivedAt).toBe(first.archivedAt);
    });

    it('rejects every write to an archived group and still serves reads', async () => {
      const { ania, groupId, aniaId, bartekId, tomekId, g } = await setup();
      await parseResponse(g.archive.$put({ param: { groupId } }));
      const archived = { error: 'archived' };
      const rejected = async (res: Response | Promise<Response>) => {
        const r = await res;
        expect(r.status).toBe(409);
        expect(await r.json()).toEqual(archived);
      };

      await rejected(g.entries.$post({ param: { groupId }, json: expense(aniaId, bartekId, 1000) }));
      await rejected(g.members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Kasia' } }));
      await rejected(
        g.members[':memberId'].$patch({ param: { groupId, memberId: tomekId }, json: { displayName: 'Tomasz' } }),
      );
      await rejected(
        g.members[':memberId'].attendance.$put({ param: { groupId, memberId: tomekId }, json: { attendance: null } }),
      );
      await rejected(g.settings.$patch({ param: { groupId }, json: { simplifyDebts: false } }));
      await rejected(g.link.revoke.$post({ param: { groupId } }));
      // Any route a later slice adds under the group is covered too (e.g. entry edits).
      await rejected(app.request(`/groups/${groupId}/entries/${randomUUID()}`, { method: 'DELETE', headers: { cookie: ania.cookie } }));

      expect((await g.$get({ param: { groupId } })).status).toBe(200);
      expect((await g.entries.$get({ param: { groupId } })).status).toBe(200);
      expect((await g.balances.$get({ param: { groupId } })).status).toBe(200);
      expect((await g.stats.$get({ param: { groupId } })).status).toBe(200);
      expect((await g.link.$get({ param: { groupId } })).status).toBe(200);
    });

    it('nobody can join or claim a member of an archived group via its link', async () => {
      const { groupId, token, tomekId, g } = await setup();
      await parseResponse(g.archive.$put({ param: { groupId } }));
      const kasia = await signIn('kasia@example.com');
      const join = await client(kasia).links[':token'].join.$post({ param: { token } });
      expect(join.status).toBe(409);
      expect(await join.json()).toEqual({ error: 'archived' });
      const claim = await client(kasia).links[':token'].claim.$post({ param: { token }, json: { memberId: tomekId } });
      expect(claim.status).toBe(409);
      expect(await claim.json()).toEqual({ error: 'archived' });
    });

    it('a member can still mute or unmute an archived group (personal setting)', async () => {
      const { groupId, g } = await setup();
      await parseResponse(g.archive.$put({ param: { groupId } }));

      const muted = await g.notifications.$put({ param: { groupId }, json: { enabled: false } });
      expect(muted.status).toBe(200);
      expect(await parseResponse(g.notifications.$get({ param: { groupId } }))).toEqual({ enabled: false });
      await parseResponse(g.notifications.$put({ param: { groupId }, json: { enabled: true } }));
      expect(await parseResponse(g.notifications.$get({ param: { groupId } }))).toEqual({ enabled: true });
    });

    it('after unarchiving, writes work again', async () => {
      const { groupId, aniaId, bartekId, g } = await setup();
      await parseResponse(g.archive.$put({ param: { groupId } }));
      await parseResponse(g.archive.$delete({ param: { groupId } }));
      const res = await g.entries.$post({ param: { groupId }, json: expense(aniaId, bartekId, 1000) });
      expect(res.status).toBe(201);
    });

    it('answers 404 to a non-member', async () => {
      const { groupId } = await setup();
      const kasia = await signIn('kasia@example.com');
      const g = client(kasia).groups[':groupId'];
      expect((await g.archive.$put({ param: { groupId } })).status).toBe(404);
      expect((await g.archive.$delete({ param: { groupId } })).status).toBe(404);
    });
  });

  describe('leaving', () => {
    it('blocks leaving with a non-zero balance and says how much', async () => {
      const { bartek, groupId, aniaId, bartekId, g } = await setup();
      await parseResponse(g.entries.$post({ param: { groupId }, json: expense(aniaId, bartekId, 2500) }));

      const res = await client(bartek).groups[':groupId'].leave.$post({ param: { groupId } });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'non_zero_balance', balance: -2500 });
      expect((await client(bartek).groups[':groupId'].$get({ param: { groupId } })).status).toBe(200);
    });

    it('with a zero balance the member leaves: access is gone, the member stays without an account', async () => {
      const { bartek, groupId, aniaId, bartekId, g } = await setup();
      // Bartek's debt settled: balance back to zero, entries still reference him.
      await parseResponse(g.entries.$post({ param: { groupId }, json: expense(aniaId, bartekId, 2500) }));
      await parseResponse(
        g.entries.$post({
          param: { groupId },
          json: { kind: 'settlement', id: randomUUID(), date: '2026-07-12', amount: 2500, currency: 'PLN', rateToBase: '1', from: bartekId, to: aniaId },
        }),
      );

      const res = await client(bartek).groups[':groupId'].leave.$post({ param: { groupId } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ left: true });

      expect((await client(bartek).groups[':groupId'].$get({ param: { groupId } })).status).toBe(404);
      expect(await parseResponse(client(bartek).groups.$get())).toEqual([]);
      const group = await parseResponse(g.$get({ param: { groupId } }));
      expect(group.members.find((m) => m.id === bartekId)).toMatchObject({ displayName: 'bartek', userId: null });
      const balances = await parseResponse(g.balances.$get({ param: { groupId } }));
      expect(balances.balances.every((b) => b.amount === 0)).toBe(true);
    });

    it('works in an archived group too', async () => {
      const { bartek, groupId, g } = await setup();
      await parseResponse(g.archive.$put({ param: { groupId } }));
      expect((await client(bartek).groups[':groupId'].leave.$post({ param: { groupId } })).status).toBe(200);
    });

    it('answers 404 to a non-member', async () => {
      const { groupId } = await setup();
      const kasia = await signIn('kasia@example.com');
      expect((await client(kasia).groups[':groupId'].leave.$post({ param: { groupId } })).status).toBe(404);
    });
  });

  describe('permanent deletion', () => {
    it('the owner deletes the group with everything in it', async () => {
      const { bartek, groupId, aniaId, bartekId, g } = await setup();
      await parseResponse(g.entries.$post({ param: { groupId }, json: expense(aniaId, bartekId, 2500) }));

      const res = await g.$delete({ param: { groupId } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });

      expect((await g.$get({ param: { groupId } })).status).toBe(404);
      expect((await client(bartek).groups[':groupId'].$get({ param: { groupId } })).status).toBe(404);
      expect(await parseResponse(client(bartek).groups.$get())).toEqual([]);
    });

    it('another member cannot delete it', async () => {
      const { bartek, groupId } = await setup();
      const res = await client(bartek).groups[':groupId'].$delete({ param: { groupId } });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden' });
    });

    it('the owner deletes an archived group too', async () => {
      const { groupId, g } = await setup();
      await parseResponse(g.archive.$put({ param: { groupId } }));
      expect((await g.$delete({ param: { groupId } })).status).toBe(200);
    });

    it('once the owner deleted their account, any member can delete the group', async () => {
      const { ania, bartek, groupId } = await setup();
      expect((await client(bartek).groups[':groupId'].$delete({ param: { groupId } })).status).toBe(403);
      await parseResponse(client(ania).me.$delete({ json: {} }));

      expect((await client(bartek).groups[':groupId'].$delete({ param: { groupId } })).status).toBe(200);
    });

    it('once the owner left, any member can delete the group', async () => {
      const { bartek, groupId, g } = await setup();
      expect((await client(bartek).groups[':groupId'].$delete({ param: { groupId } })).status).toBe(403);
      await parseResponse(g.leave.$post({ param: { groupId } }));
      expect((await client(bartek).groups[':groupId'].$delete({ param: { groupId } })).status).toBe(200);
    });

    it('answers 404 to a non-member', async () => {
      const { groupId } = await setup();
      const kasia = await signIn('kasia@example.com');
      expect((await client(kasia).groups[':groupId'].$delete({ param: { groupId } })).status).toBe(404);
    });
  });
});
