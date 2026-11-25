import { randomUUID } from 'node:crypto';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

type Session = { cookie: string; userId: string };

const ADMIN = 'moderator@example.com';

describe('blocked accounts can sign in only to delete the account (#48)', () => {
  const { app, json, signIn, client } = createTestApp({ adminEmails: [ADMIN] });

  const block = (admin: Session, userId: string) =>
    client(admin).admin.users[':userId'].block.$post({ param: { userId }, json: { reason: 'repeated nudity' } });

  /** Ania's group which Bartek joined; Ania blocked by the admin and signed in again. */
  async function blockedAnia() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const admin = await signIn(ADMIN);
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    expect((await block(admin, ania.userId)).status).toBe(200);
    const blocked = await signIn('ania@example.com');
    return { ania: blocked, bartek, admin, groupId, ownerMemberId: group.ownerMemberId };
  }

  it('a blocked user completes sign-in and the session says it is blocked', async () => {
    const { ania } = await blockedAnia();
    expect(await parseResponse(client(ania).me.$get())).toEqual(
      expect.objectContaining({ id: ania.userId, email: 'ania@example.com', blocked: true }),
    );
  });

  it('a blocked session is rejected everywhere else, including the groups it belongs to', async () => {
    const { ania, groupId } = await blockedAnia();
    const api = client(ania);
    const statuses = await Promise.all([
      api.groups.$get(),
      api.groups[':groupId'].$get({ param: { groupId } }),
      api.groups[':groupId'].entries.$get({ param: { groupId } }),
      api.groups[':groupId'].link.$get({ param: { groupId } }),
      api.activity.$get({ query: {} }),
      api.me['payout-details'].$get(),
      api.me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 1000 } }),
      api.me['push-tokens'].$put({ json: { token: 'ExponentPushToken[x]', platform: 'ios', locale: 'pl' } }),
      api.me.notifications.$get(),
      api.reports.$post({ json: { photoId: randomUUID(), reason: 'sexual' } }),
    ]).then((responses) => responses.map((r) => r.status));
    expect(statuses).toEqual(statuses.map(() => 403));
    expect(await (await api.groups.$get()).json()).toEqual({ error: 'account_blocked' });
  });

  it('a blocked session cannot change the account through the auth endpoints, but can sign out', async () => {
    const { ania } = await blockedAnia();
    const headers = { cookie: ania.cookie, origin: 'kwitz://' };
    const rename = await app.request('/api/auth/update-user', json({ name: 'Ania 2' }, headers));
    expect(rename.status).toBe(403);
    const session = await app.request('/api/auth/get-session', { headers });
    expect(session.status).toBe(200);
    const signOut = await app.request('/api/auth/sign-out', json({}, headers));
    expect(signOut.status).toBe(200);
    expect((await client(ania).me.$get()).status).toBe(401);
  });

  const deletions = [
    { removeName: false, nameLeft: 'ania' },
    { removeName: true, nameLeft: null },
  ];
  for (const { removeName, nameLeft } of deletions) {
    it(`a blocked user deletes the account (removeName: ${removeName})`, async () => {
      const { ania, bartek, admin, groupId, ownerMemberId } = await blockedAnia();
      expect(await parseResponse(client(ania).me.$delete({ json: { removeName } }))).toEqual({ deleted: true });

      expect((await client(ania).me.$get()).status).toBe(401);
      const { members } = await parseResponse(client(bartek).groups[':groupId'].$get({ param: { groupId } }));
      expect(members.find((m) => m.id === ownerMemberId)).toMatchObject({ userId: null, displayName: nameLeft });
      // The block goes with the account.
      expect((await parseResponse(client(admin).admin.users.blocked.$get())).blocked).toEqual([]);
    });
  }

  it('unblocking restores normal access on the next request of the same session', async () => {
    const { ania, admin } = await blockedAnia();
    expect((await client(ania).groups.$get()).status).toBe(403);
    await client(admin).admin.users[':userId'].block.$delete({ param: { userId: ania.userId } });
    expect((await client(ania).groups.$get()).status).toBe(200);
    expect(await parseResponse(client(ania).me.$get())).toEqual(expect.objectContaining({ blocked: false }));
  });
});
