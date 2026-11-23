import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

describe('settlements', () => {
  const { signIn, client } = createTestApp();

  /** Ania paid 90,00 zł for herself, Bartek (joined via the link) and Tomek (no account). */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const aniaId = group.ownerMemberId;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    const { memberId: bartekId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const tomek = await parseResponse(
      client(ania).groups[':groupId'].members.$post({ param: { groupId }, json: { id: randomUUID(), displayName: 'Tomek' } }),
    );
    await parseResponse(
      client(ania).groups[':groupId'].entries.$post({
        param: { groupId },
        json: {
          kind: 'expense',
          id: randomUUID(),
          date: '2026-07-11',
          title: 'Paliwo',
          amount: 9_000,
          currency: 'PLN',
          rateToBase: '1',
          category: 'fuel',
          receiptPhotoId: null,
          payers: [{ memberId: aniaId, amount: 9_000 }],
          split: { mode: 'equal', memberIds: [aniaId, bartekId, tomek.id] },
        },
      }),
    );
    const settle = (from: string, to: string, amount: number, session = bartek) => {
      const entry: NewEntry = { kind: 'settlement', id: randomUUID(), date: '2026-07-12', amount, currency: 'PLN', rateToBase: '1', from, to };
      return client(session).groups[':groupId'].entries.$post({ param: { groupId }, json: entry });
    };
    const balances = () => parseResponse(client(ania).groups[':groupId'].balances.$get({ param: { groupId } }));
    return { ania, bartek, groupId, aniaId, bartekId, tomekId: tomek.id, settle, balances };
  }

  it('settling the suggested transfer brings the payer’s balance to zero', async () => {
    const { aniaId, bartekId, tomekId, settle, balances } = await setup();
    const before = await balances();
    const suggested = before.transfers.find((t) => t.from === bartekId);
    expect(suggested).toEqual({ from: bartekId, to: aniaId, amount: 3_000 });

    const res = await settle(suggested!.from, suggested!.to, suggested!.amount);
    expect(res.status).toBe(201);

    const after = await balances();
    expect(after.balances).toEqual([
      { memberId: aniaId, amount: 3_000 },
      { memberId: bartekId, amount: 0 },
      { memberId: tomekId, amount: -3_000 },
    ]);
    expect(after.transfers).toEqual([{ from: tomekId, to: aniaId, amount: 3_000 }]);
  });

  it('records a settlement between other members, stored as an entry of kind settlement', async () => {
    const { groupId, ania, aniaId, tomekId, settle, balances } = await setup();

    const res = await settle(tomekId, aniaId, 1_000);
    expect(res.status).toBe(201);
    const entry = await res.json();
    expect(entry).toMatchObject({ kind: 'settlement', from: tomekId, to: aniaId, amount: 1_000, version: 1 });

    const entries = await parseResponse(client(ania).groups[':groupId'].entries.$get({ param: { groupId } }));
    expect(entries.map((e) => e.kind)).toEqual(['expense', 'settlement']);
    expect((await balances()).balances).toContainEqual({ memberId: tomekId, amount: -2_000 });
  });

  it('rejects a settlement to oneself or with someone outside the group', async () => {
    const { aniaId, settle } = await setup();

    const toSelf = await settle(aniaId, aniaId, 1_000);
    expect(toSelf.status).toBe(400);
    const outsider = await settle(aniaId, randomUUID(), 1_000);
    expect(outsider.status).toBe(400);
    const zero = await settle(aniaId, randomUUID(), 0);
    expect(zero.status).toBe(400);
  });

  it('edits a settlement with the version it was based on; a stale edit is a version conflict', async () => {
    const { groupId, ania, bartek, aniaId, bartekId, tomekId, settle, balances } = await setup();
    const created = await parseResponse(settle(bartekId, aniaId, 3_000));
    const as = (from: string, amount: number): NewEntry => ({
      kind: 'settlement',
      id: created.id,
      date: '2026-07-12',
      amount,
      currency: 'PLN',
      rateToBase: '1',
      from,
      to: aniaId,
    });
    const put = (session: typeof ania, baseVersion: number, entry: NewEntry) =>
      client(session).groups[':groupId'].entries[':entryId'].$put({
        param: { groupId, entryId: created.id },
        json: { baseVersion, entry },
      });

    const res = await put(ania, 1, as(tomekId, 1_000));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kind: 'settlement', from: tomekId, to: aniaId, amount: 1_000, version: 2 });
    expect((await balances()).balances).toContainEqual({ memberId: bartekId, amount: -3_000 });

    const stale = await put(bartek, 1, as(bartekId, 2_000));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: 'version_conflict', entry: { version: 2, amount: 1_000 } });
  });
});
