import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('public view-only web API (group link, no session)', () => {
  const { app, signIn, client } = createTestApp({ webUrl: 'https://app.example.org' });

  /**
   * Ania's trip with Bartek (joined via the link, has payout details) and
   * Tomek (member without an account). Ania paid 100 PLN for her and Bartek.
   */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: {
          id: randomUUID(),
          name: 'Mazury <2026>',
          emoji: '⛵',
          color: '#1E88E5',
          baseCurrency: 'PLN',
          startDate: '2026-07-10',
          endDate: '2026-07-12',
        },
      }),
    );
    const groupId = group.id;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }),
    );
    await parseResponse(
      client(bartek)['me']['payout-details'].$put({ json: { bankAccount: '61109010140000071219812874', blikPhone: '600700800' } }),
    );
    const aniaId = group.ownerMemberId;
    const expense: NewEntry = {
      kind: 'expense',
      id: randomUUID(),
      date: '2026-07-11',
      title: 'Zakupy',
      amount: 10_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'groceries',
      receiptPhotoId: null,
      payers: [{ memberId: aniaId, amount: 10_000 }],
      split: { mode: 'equal', memberIds: [aniaId, bartekId] },
    };
    await parseResponse(client(ania).groups[':groupId'].entries.$post({ param: { groupId }, json: expense }));
    const pub = client().public.links[':token'];
    return { ania, bartek, groupId, token, aniaId, bartekId, tomekId: tomek.id, expense, pub };
  }

  /** Nothing personal beyond display names: no emails, user ids, payout details or photos. */
  function expectNoPrivateData(body: unknown, userIds: string[]) {
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/@example\.com/);
    expect(text).not.toMatch(/userId|email|bankAccount|blikPhone|payout/i);
    expect(text).not.toContain('61109010140000071219812874');
    expect(text).not.toContain('600700800');
    for (const id of userIds) expect(text).not.toContain(id);
  }

  it('shows the group and its members for the group link without signing in', async () => {
    const { token, groupId, aniaId, bartekId, tomekId, ania, bartek, pub } = await setup();

    const res = await pub.$get({ param: { token } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      group: {
        id: groupId,
        name: 'Mazury <2026>',
        emoji: '⛵',
        color: '#1E88E5',
        baseCurrency: 'PLN',
        startDate: '2026-07-10',
        endDate: '2026-07-12',
        simplifyDebts: true,
        archivedAt: null,
      },
      members: [
        { id: aniaId, displayName: 'ania', hasAccount: true, attendance: null },
        { id: bartekId, displayName: 'bartek', hasAccount: true, attendance: null },
        { id: tomekId, displayName: 'Tomek', hasAccount: false, attendance: null },
      ],
      claimFor: null,
    });
    expectNoPrivateData(body, [ania.userId, bartek.userId]);
  });

  it('lists live entries without user ids or receipt photos, naming the member who added them', async () => {
    const { token, aniaId, expense, ania, bartek, pub } = await setup();

    const body = await parseResponse(pub.entries.$get({ param: { token } }));
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: expense.id,
      kind: 'expense',
      title: 'Zakupy',
      amount: 10_000,
      receiptPhotoId: null,
      createdBy: '00000000-0000-0000-0000-000000000000',
      addedBy: aniaId,
    });
    expectNoPrivateData(body, [ania.userId, bartek.userId]);
  });

  it('returns balances with transfers and the stats, without payout details', async () => {
    const { token, aniaId, bartekId, tomekId, ania, bartek, pub } = await setup();

    const balances = await pub.balances.$get({ param: { token } });
    expect(balances.status).toBe(200);
    const balancesBody = await balances.json();
    expect(balancesBody).toEqual({
      baseCurrency: 'PLN',
      simplifyDebts: true,
      balances: [
        { memberId: aniaId, amount: 5_000 },
        { memberId: bartekId, amount: -5_000 },
        { memberId: tomekId, amount: 0 },
      ],
      transfers: [{ from: bartekId, to: aniaId, amount: 5_000 }],
    });
    expectNoPrivateData(balancesBody, [ania.userId, bartek.userId]);

    const stats = await pub.stats.$get({ param: { token } });
    expect(stats.status).toBe(200);
    expect(await stats.json()).toMatchObject({ baseCurrency: 'PLN', total: 10_000 });
  });

  it('answers 404 for unknown and revoked tokens on every public endpoint', async () => {
    const { token, groupId, ania, pub } = await setup();
    await parseResponse(client(ania).groups[':groupId'].link.revoke.$post({ param: { groupId } }));

    for (const t of [token, 'no-such-token']) {
      for (const res of await Promise.all([
        pub.$get({ param: { token: t } }),
        pub.entries.$get({ param: { token: t } }),
        pub.balances.$get({ param: { token: t } }),
        pub.stats.$get({ param: { token: t } }),
      ])) {
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'not_found' });
      }
    }
  });

  it('is scoped to the token: shows only that group, never another one', async () => {
    const { token, ania } = await setup();
    const other = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Inna', emoji: '🏠', color: '#000000', baseCurrency: 'EUR', startDate: null, endDate: null },
      }),
    );
    const otherToken = (
      await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: other.id } }))
    ).token;

    const pub = client().public.links[':token'];
    const first = await parseResponse(pub.$get({ param: { token } }));
    const second = await parseResponse(pub.$get({ param: { token: otherToken } }));
    expect(first.group.name).toBe('Mazury <2026>');
    expect(second.group.name).toBe('Inna');
    expect(await parseResponse(pub.entries.$get({ param: { token: otherToken } }))).toEqual([]);
  });

  it('opens a personal claim link too and says whose it is', async () => {
    const { groupId, tomekId, ania, pub } = await setup();
    const { token } = await parseResponse(
      client(ania).groups[':groupId'].members[':memberId']['claim-link'].$get({ param: { groupId, memberId: tomekId } }),
    );

    const body = await parseResponse(pub.$get({ param: { token } }));
    expect(body.group.id).toBe(groupId);
    expect(body.claimFor).toBe(tomekId);
  });

  it('lets the web app on another origin read it (CORS)', async () => {
    const { token } = await setup();
    const res = await app.request(`/public/links/${token}`, { headers: { origin: 'https://app.example.org' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  describe('Open Graph link preview', () => {
    it('serves the group name and emoji as Open Graph tags, escaped, linking to the web view', async () => {
      const { token } = await setup();

      const res = await app.request(`/og/${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
      const html = await res.text();
      expect(html).toContain('<meta property="og:title" content="⛵ Mazury &lt;2026&gt;">');
      expect(html).toContain('<meta property="og:description" content="Wydatki grupy w split-pay · 3 osoby">');
      expect(html).toContain(`<meta property="og:url" content="https://app.example.org/g/${token}">`);
      expect(html).not.toContain('Mazury <2026>');
      expect(html).not.toMatch(/@example\.com/);
    });

    it('speaks English to English-speaking crawlers', async () => {
      const { token } = await setup();
      const html = await (await app.request(`/og/${token}`, { headers: { 'accept-language': 'en-GB,en;q=0.9' } })).text();
      expect(html).toContain('<meta property="og:description" content="Group expenses in split-pay · 3 members">');
    });

    it('shows a generic "link no longer valid" preview for a revoked token', async () => {
      const { token, groupId, ania } = await setup();
      await parseResponse(client(ania).groups[':groupId'].link.revoke.$post({ param: { groupId } }));

      const res = await app.request(`/og/${token}`);
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('<meta property="og:title" content="split-pay">');
      expect(html).not.toContain('Mazury');
    });
  });
});
