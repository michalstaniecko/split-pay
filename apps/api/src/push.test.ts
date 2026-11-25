import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp } from '../test/app';
import { testDb } from '../test/db';
import { members } from './db/schema';
import { dispatchPushes } from './push/dispatch';
import type { PushMessage, PushSender, PushTicket } from './push/sender';

/** A fake Expo push service: records messages; tokens listed in `unregistered` are reported as gone. */
function fakeSender(unregistered: string[] = []) {
  const sent: PushMessage[] = [];
  const sender: PushSender = {
    async send(messages) {
      sent.push(...messages);
      return messages.map(
        (m): PushTicket =>
          unregistered.includes(m.to)
            ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
            : { status: 'ok' },
      );
    },
  };
  return { sent, sender };
}

/** Far enough in the future for every burst to be over. */
const later = () => new Date(Date.now() + 60 * 60 * 1000);
const plain = (s: string | undefined) => s?.replace(/[  ]/g, ' ');

describe('push notifications', () => {
  const { signIn, client, app } = createTestApp();

  /**
   * Ania's group "Mieszkanie" with Bartek and Kasia (accounts, joined via the
   * link) and Tomek (no account). Bartek's phone (Polish) and Kasia's (English)
   * are registered.
   */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const kasia = await signIn('kasia@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mieszkanie', emoji: '🏠', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const aniaId = group.ownerMemberId;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const { memberId: kasiaId } = await parseResponse(client(kasia).links[':token'].join.$post({ param: { token } }));
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }),
    );
    await register(bartek, 'ExponentPushToken[bartek]', 'pl');
    await register(kasia, 'ExponentPushToken[kasia]', 'en');

    const expense = (payer: string, participants: string[], amount = 4550, title = 'Pizza'): NewEntry => ({
      kind: 'expense',
      id: randomUUID(),
      date: '2026-07-11',
      title,
      amount,
      currency: 'PLN',
      rateToBase: '1',
      category: 'food',
      receiptPhotoId: null,
      payers: [{ memberId: payer, amount }],
      split: { mode: 'equal', memberIds: participants },
    });
    const add = (session: { cookie: string }, entry: NewEntry) =>
      parseResponse(client(session).groups[':groupId'].entries.$post({ param: { groupId }, json: entry }));
    return { ania, bartek, kasia, groupId, aniaId, bartekId, kasiaId, tomekId: tomek.id, expense, add };
  }

  async function register(session: { cookie: string }, token: string, locale: string) {
    const res = await client(session).me['push-tokens'].$put({ json: { token, platform: 'ios', locale } });
    expect(res.status).toBe(200);
  }

  const visible = (sent: PushMessage[]) => sent.filter((m) => m.data.type === 'notification');
  const silent = (sent: PushMessage[]) => sent.filter((m) => m.data.type === 'sync');

  it('a new expense notifies members taking part, in their language, never the author', async () => {
    const { ania, aniaId, bartekId, tomekId, groupId, expense, add } = await setup();
    const pizza = await add(ania, expense(aniaId, [aniaId, bartekId, tomekId]));

    const { sent, sender } = fakeSender();
    await dispatchPushes(testDb.db, sender, { now: later() });

    expect(visible(sent)).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[bartek]',
        title: '🏠 Mieszkanie',
        body: 'ania: dodano wydatek „Pizza”',
        data: { type: 'notification', groupId, entryId: pizza.id },
      }),
    ]);
    // Kasia takes no part: her app only syncs.
    expect(silent(sent)).toEqual([
      expect.objectContaining({ to: 'ExponentPushToken[kasia]', data: { type: 'sync', groupId }, _contentAvailable: true }),
    ]);
    expect(silent(sent)[0]).not.toHaveProperty('body');
  });

  it('groups a burst of expenses into one notification ("Kasia added 3 expenses")', async () => {
    const { kasia, kasiaId, bartekId, expense, add } = await setup();
    let last;
    for (const title of ['Pizza', 'Piwo', 'Taxi']) last = await add(kasia, expense(kasiaId, [kasiaId, bartekId], 1000, title));

    const { sent, sender } = fakeSender();
    // Still within the burst: nothing goes out yet.
    await dispatchPushes(testDb.db, sender, { now: new Date() });
    expect(sent).toEqual([]);

    await dispatchPushes(testDb.db, sender, { now: later() });
    expect(visible(sent)).toEqual([
      expect.objectContaining({ to: 'ExponentPushToken[bartek]', body: 'kasia: dodano 3 wydatki', data: expect.objectContaining({ entryId: last!.id }) }),
    ]);

    // Sent pushes are not sent again.
    const again = fakeSender();
    await dispatchPushes(testDb.db, again.sender, { now: later() });
    expect(again.sent).toEqual([]);
  });

  it('editing and deleting notify the members taking part', async () => {
    const { ania, aniaId, bartekId, kasiaId, groupId, expense, add } = await setup();
    const pizza = await add(ania, expense(aniaId, [aniaId, bartekId]));
    await dispatchPushes(testDb.db, fakeSender().sender, { now: later() });

    const edited = await parseResponse(
      client(ania).groups[':groupId'].entries[':entryId'].$put({
        param: { groupId, entryId: pizza.id },
        json: { baseVersion: 1, entry: { ...expense(aniaId, [aniaId, kasiaId]), id: pizza.id } },
      }),
    );
    const editPushes = fakeSender();
    await dispatchPushes(testDb.db, editPushes.sender, { now: later() });
    // Bartek was removed from it, Kasia was added: both hear about it.
    expect(visible(editPushes.sent).map((m) => [m.to, m.body])).toEqual(
      expect.arrayContaining([
        ['ExponentPushToken[bartek]', 'ania: zmieniono wydatek „Pizza”'],
        ['ExponentPushToken[kasia]', 'ania edited the expense “Pizza”'],
      ]),
    );

    await parseResponse(
      client(ania).groups[':groupId'].entries[':entryId'].$delete({
        param: { groupId, entryId: pizza.id },
        query: { baseVersion: String(edited.version) },
      }),
    );
    const deletePushes = fakeSender();
    await dispatchPushes(testDb.db, deletePushes.sender, { now: later() });
    expect(visible(deletePushes.sent)).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[kasia]',
        body: 'ania deleted the expense “Pizza”',
        data: { type: 'notification', groupId },
      }),
    ]);
  });

  it('undoing an edit from the change history notifies like the edit itself', async () => {
    const { ania, aniaId, bartekId, kasiaId, groupId, expense, add } = await setup();
    const pizza = await add(ania, expense(aniaId, [aniaId, bartekId]));
    await parseResponse(
      client(ania).groups[':groupId'].entries[':entryId'].$put({
        param: { groupId, entryId: pizza.id },
        json: { baseVersion: 1, entry: { ...expense(aniaId, [aniaId, kasiaId]), id: pizza.id } },
      }),
    );
    await dispatchPushes(testDb.db, fakeSender().sender, { now: later() });

    const history = await parseResponse(client(ania).groups[':groupId'].changes.$get({ param: { groupId }, query: {} }));
    const edit = history.find((change) => change.kind === 'entry.edit');
    const undo = await client(ania).groups[':groupId'].changes[':changeId'].undo.$post({
      param: { groupId, changeId: edit!.id },
    });
    expect(undo.status).toBe(200);

    const { sent, sender } = fakeSender();
    await dispatchPushes(testDb.db, sender, { now: later() });
    // Kasia is out of the expense again, Bartek is back in: both hear about it.
    expect(visible(sent).map((m) => [m.to, m.body])).toEqual(
      expect.arrayContaining([
        ['ExponentPushToken[bartek]', 'ania: zmieniono wydatek „Pizza”'],
        ['ExponentPushToken[kasia]', 'ania edited the expense “Pizza”'],
      ]),
    );
  });

  it('a settlement notifies only the member it is in favour of', async () => {
    const { bartek, aniaId, bartekId, groupId, add } = await setup();
    await add(bartek, {
      kind: 'settlement',
      id: randomUUID(),
      date: '2026-07-11',
      amount: 3000,
      currency: 'PLN',
      rateToBase: '1',
      from: bartekId,
      to: aniaId,
    });
    await register(await signIn('ania@example.com'), 'ExponentPushToken[ania]', 'pl');

    const { sent, sender } = fakeSender();
    await dispatchPushes(testDb.db, sender, { now: later() });
    expect(visible(sent).map((m) => [m.to, plain(m.body)])).toEqual([
      ['ExponentPushToken[ania]', 'bartek: spłata dla Ciebie · 30,00 zł'],
    ]);
    expect(silent(sent).map((m) => m.data)).toEqual([{ type: 'sync', groupId }]);
  });

  it('an author whose member name was removed reads "Deleted user" in each recipient’s language (ADR-0019)', async () => {
    const { ania, aniaId, bartekId, kasiaId, expense, add } = await setup();
    await testDb.db.update(members).set({ displayName: null }).where(eq(members.id, aniaId));
    await add(ania, expense(aniaId, [aniaId, bartekId, kasiaId]));

    const { sent, sender } = fakeSender();
    await dispatchPushes(testDb.db, sender, { now: later() });
    expect(visible(sent).map((m) => [m.to, m.body])).toEqual(
      expect.arrayContaining([
        ['ExponentPushToken[bartek]', 'Usunięte konto: dodano wydatek „Pizza”'],
        ['ExponentPushToken[kasia]', 'Deleted user added the expense “Pizza”'],
      ]),
    );
  });

  it('a claim notifies the other members with an account', async () => {
    const { ania, tomekId, groupId } = await setup();
    const tomasz = await signIn('tomasz@example.com');
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    await parseResponse(client(tomasz).links[':token'].claim.$post({ param: { token }, json: { memberId: tomekId } }));

    const { sent, sender } = fakeSender();
    await dispatchPushes(testDb.db, sender, { now: new Date() });
    expect(visible(sent).map((m) => [m.to, m.body])).toEqual(
      expect.arrayContaining([
        ['ExponentPushToken[bartek]', 'Przejęcie profilu Tomek: tomasz'],
        ['ExponentPushToken[kasia]', 'tomasz claimed the Tomek profile'],
      ]),
    );
  });

  it('respects the global switch and the per-group switch', async () => {
    const { ania, bartek, kasia, aniaId, bartekId, kasiaId, groupId, expense, add } = await setup();
    expect(await parseResponse(client(bartek).me.notifications.$get())).toEqual({ enabled: true });
    expect(await parseResponse(client(bartek).me.notifications.$put({ json: { enabled: false } }))).toEqual({
      enabled: false,
    });
    const groupSwitch = client(kasia).groups[':groupId'].notifications;
    expect(await parseResponse(groupSwitch.$get({ param: { groupId } }))).toEqual({ enabled: true });
    await parseResponse(groupSwitch.$put({ param: { groupId }, json: { enabled: false } }));
    expect(await parseResponse(groupSwitch.$get({ param: { groupId } }))).toEqual({ enabled: false });

    await add(ania, expense(aniaId, [aniaId, bartekId, kasiaId]));
    const { sent, sender } = fakeSender();
    await dispatchPushes(testDb.db, sender, { now: later() });
    // No visible notification, but both apps still sync.
    expect(visible(sent)).toEqual([]);
    expect(silent(sent).map((m) => m.to).sort()).toEqual(['ExponentPushToken[bartek]', 'ExponentPushToken[kasia]']);
  });

  it('the per-group switch is only for members of the group', async () => {
    const { groupId } = await setup();
    const outsider = await signIn('obcy@example.com');
    const res = await client(outsider).groups[':groupId'].notifications.$get({ param: { groupId } });
    expect(res.status).toBe(404);
  });

  it('removes the push token on sign-out and forgets tokens Expo reports as unregistered', async () => {
    const { ania, bartek, aniaId, bartekId, kasiaId, expense, add } = await setup();
    const signOut = await app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie: bartek.cookie, origin: 'kwitz://' },
    });
    expect(signOut.status).toBe(200);

    await add(ania, expense(aniaId, [aniaId, bartekId, kasiaId]));
    const first = fakeSender(['ExponentPushToken[kasia]']);
    await dispatchPushes(testDb.db, first.sender, { now: later() });
    expect(first.sent.map((m) => m.to)).toEqual(['ExponentPushToken[kasia]']);

    await add(ania, expense(aniaId, [aniaId, kasiaId]));
    const second = fakeSender();
    await dispatchPushes(testDb.db, second.sender, { now: later() });
    expect(second.sent).toEqual([]);
  });

  it('a token can be unregistered explicitly and moves to whoever registers it next', async () => {
    const { ania, bartek, aniaId, bartekId, expense, add } = await setup();
    const del = await client(bartek).me['push-tokens'].$delete({ json: { token: 'ExponentPushToken[bartek]' } });
    expect(del.status).toBe(200);
    await add(ania, expense(aniaId, [aniaId, bartekId]));
    const { sent, sender } = fakeSender();
    await dispatchPushes(testDb.db, sender, { now: later() });
    expect(sent.filter((m) => m.to === 'ExponentPushToken[bartek]')).toEqual([]);
  });

  describe('"Przypomnij" nudges', () => {
    /** Ania paid 90 zł for Ania, Bartek and Tomek: both owe her 30 zł. */
    async function owing() {
      const ctx = await setup();
      await ctx.add(ctx.ania, ctx.expense(ctx.aniaId, [ctx.aniaId, ctx.bartekId, ctx.tomekId], 9000));
      await dispatchPushes(testDb.db, fakeSender().sender, { now: later() });
      const nudges = (session = ctx.ania) => client(session).groups[':groupId'].nudges;
      const nudge = (memberId: string, session = ctx.ania) =>
        nudges(session).$post({ param: { groupId: ctx.groupId }, json: { memberId } });
      return { ...ctx, nudge, nudges };
    }

    it('pushes a reminder to the member who owes me', async () => {
      const { bartekId, groupId, nudge } = await owing();
      const res = await nudge(bartekId);
      expect(res.status).toBe(201);

      const { sent, sender } = fakeSender();
      await dispatchPushes(testDb.db, sender, { now: new Date() });
      expect(visible(sent).map((m) => [m.to, plain(m.body), m.data])).toEqual([
        ['ExponentPushToken[bartek]', 'ania przypomina o zwrocie 30,00 zł', { type: 'notification', groupId }],
      ]);
    });

    it('once per member per group per 24 h, for everyone in the group', async () => {
      const { kasia, bartekId, groupId, nudge, nudges } = await owing();
      const first = await parseResponse(nudge(bartekId));
      expect(first.nextNudgeAt).toBe(new Date(Date.parse(first.nudgedAt) + 24 * 3600 * 1000).toISOString());

      const again = await nudge(bartekId);
      expect(again.status).toBe(429);
      expect(await again.json()).toEqual({ error: 'nudge_limit', nextNudgeAt: first.nextNudgeAt });

      // The drawer of anyone in the group shows "przypomniano dziś".
      expect(await parseResponse(nudges(kasia).$get({ param: { groupId } }))).toEqual([
        { memberId: bartekId, nudgedAt: first.nudgedAt, nextNudgeAt: first.nextNudgeAt },
      ]);

      // A day later it is allowed again.
      await testDb.pool.query(`UPDATE nudges SET created_at = created_at - interval '24 hours'`);
      expect(await parseResponse(nudges(kasia).$get({ param: { groupId } }))).toEqual([]);
      expect((await nudge(bartekId)).status).toBe(201);
    });

    it('not for members without an account, myself or someone who owes me nothing', async () => {
      const { aniaId, tomekId, kasiaId, bartek, nudge } = await owing();
      expect((await nudge(tomekId)).status).toBe(400);
      expect((await nudge(aniaId)).status).toBe(400);
      expect((await nudge(kasiaId)).status).toBe(400);
      // Bartek is owed nothing by Ania.
      expect((await nudge(aniaId, bartek)).status).toBe(400);
    });

    it('not in an archived group', async () => {
      const { bartekId, groupId, nudge } = await owing();
      await testDb.pool.query('UPDATE groups SET archived_at = now() WHERE id = $1', [groupId]);
      expect((await nudge(bartekId)).status).toBe(409);
    });

    it('only for members of the group', async () => {
      const { bartekId, nudge } = await owing();
      const outsider = await signIn('obcy@example.com');
      expect((await nudge(bartekId, outsider)).status).toBe(404);
    });
  });

  it('deleting the account deletes its push tokens', async () => {
    const { bartek } = await setup();
    const res = await client(bartek).me.$delete({ json: {} });
    expect(res.status).toBe(200);
    const rows = await testDb.pool.query('SELECT token FROM push_tokens');
    expect(rows.rows).toEqual([{ token: 'ExponentPushToken[kasia]' }]);
  });
});
