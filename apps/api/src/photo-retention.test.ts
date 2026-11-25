import { randomUUID } from 'node:crypto';
import type { NewEntry } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';
import { testDb } from '../test/db';
import { runPhotoRetention } from './storage/retention';

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);

type Session = { cookie: string; userId: string };

describe('photo retention job', () => {
  const { signIn, client, storage } = createTestApp();

  /** A group of Ania's with one expense carrying a receipt photo. */
  async function groupWithReceipt(ania: Session) {
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const entryId = randomUUID();
    const issued = await parseResponse(
      client(ania).groups[':groupId'].receipts.uploads.$post({
        param: { groupId },
        json: { entryId, contentType: 'image/jpeg', size: 1000 },
      }),
    );
    storage.put(issued.upload);
    await parseResponse(
      client(ania).groups[':groupId'].receipts.uploads[':photoId'].complete.$post({
        param: { groupId, photoId: issued.photoId },
      }),
    );
    const me = group.ownerMemberId;
    const expense: NewEntry = {
      kind: 'expense',
      id: entryId,
      date: '2026-07-11',
      title: 'Zakupy',
      amount: 1000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'groceries',
      receiptPhotoId: issued.photoId,
      payers: [{ memberId: me, amount: 1000 }],
      split: { mode: 'equal', memberIds: [me] },
    };
    await parseResponse(client(ania).groups[':groupId'].entries.$post({ param: { groupId }, json: expense }));
    const receipts = async () =>
      (await parseResponse(client(ania).groups[':groupId'].receipts.$get({ param: { groupId } }))).receipts;
    return { groupId, key: storage.keyOf(issued.upload), receipts };
  }

  const archive = (session: Session, groupId: string) =>
    client(session).groups[':groupId'].archive.$put({ param: { groupId } });

  it('deletes receipt photos of groups archived over a year ago, and only those', async () => {
    const ania = await signIn();
    const old = await groupWithReceipt(ania);
    const active = await groupWithReceipt(ania);
    await archive(ania, old.groupId);

    // 364 days after archiving: kept.
    expect(await runPhotoRetention(testDb.db, storage, daysFromNow(364))).toBe(0);
    expect(storage.objects.has(old.key)).toBe(true);

    expect(await runPhotoRetention(testDb.db, storage, daysFromNow(366))).toBe(1);
    expect(storage.objects.has(old.key)).toBe(false);
    expect(await old.receipts()).toEqual([]);
    expect(storage.objects.has(active.key)).toBe(true);
    expect(await active.receipts()).toHaveLength(1);
  });

  it('keeps receipts of a group that was unarchived again', async () => {
    const ania = await signIn();
    const trip = await groupWithReceipt(ania);
    await archive(ania, trip.groupId);
    await client(ania).groups[':groupId'].archive.$delete({ param: { groupId: trip.groupId } });

    expect(await runPhotoRetention(testDb.db, storage, daysFromNow(400))).toBe(0);
    expect(storage.objects.has(trip.key)).toBe(true);
  });

  it('deletes receipt photos left behind by a deleted group', async () => {
    const ania = await signIn();
    const trip = await groupWithReceipt(ania);
    await client(ania).groups[':groupId'].$delete({ param: { groupId: trip.groupId } });

    expect(await runPhotoRetention(testDb.db, storage, new Date())).toBe(1);
    expect(storage.objects.has(trip.key)).toBe(false);
  });

  it('deletes uploads never attached to an entry or set as avatar after a day', async () => {
    const ania = await signIn();
    const trip = await groupWithReceipt(ania);
    const stray = await parseResponse(
      client(ania).groups[':groupId'].receipts.uploads.$post({
        param: { groupId: trip.groupId },
        json: { entryId: randomUUID(), contentType: 'image/jpeg', size: 1000 },
      }),
    );
    storage.put(stray.upload);
    const strayAvatar = await parseResponse(
      client(ania).me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 1000 } }),
    );
    storage.put(strayAvatar.upload);

    expect(await runPhotoRetention(testDb.db, storage, daysFromNow(0.5))).toBe(0);
    expect(await runPhotoRetention(testDb.db, storage, daysFromNow(1.5))).toBe(2);
    expect(storage.objects.has(storage.keyOf(stray.upload))).toBe(false);
    expect(storage.objects.has(storage.keyOf(strayAvatar.upload))).toBe(false);
    expect(storage.objects.has(trip.key)).toBe(true);
  });

  it('keeps a replaced receipt (change history) until the group is due', async () => {
    const ania = await signIn();
    const trip = await groupWithReceipt(ania);
    const [first] = await trip.receipts();
    const replacement = await parseResponse(
      client(ania).groups[':groupId'].receipts.uploads.$post({
        param: { groupId: trip.groupId },
        json: { entryId: first!.entryId, contentType: 'image/jpeg', size: 1000 },
      }),
    );
    storage.put(replacement.upload);
    await parseResponse(
      client(ania).groups[':groupId'].receipts.uploads[':photoId'].complete.$post({
        param: { groupId: trip.groupId, photoId: replacement.photoId },
      }),
    );
    const [entry] = await parseResponse(
      client(ania).groups[':groupId'].entries.$get({ param: { groupId: trip.groupId } }),
    );
    if (!entry || entry.kind !== 'expense') throw new Error('expected the expense');
    const { groupId: _g, version, createdBy: _c, createdAt: _a, updatedAt: _u, deletedAt: _d, ...input } = entry;
    await parseResponse(
      client(ania).groups[':groupId'].entries[':entryId'].$put({
        param: { groupId: trip.groupId, entryId: entry.id },
        json: { baseVersion: version, entry: { ...input, receiptPhotoId: replacement.photoId } },
      }),
    );

    expect(await runPhotoRetention(testDb.db, storage, daysFromNow(30))).toBe(0);
    expect(storage.objects.has(trip.key)).toBe(true);
  });

  it('leaves the rows in place when the bucket refuses, so the next run retries', async () => {
    const ania = await signIn();
    const trip = await groupWithReceipt(ania);
    await client(ania).groups[':groupId'].$delete({ param: { groupId: trip.groupId } });
    const failing = {
      ...storage,
      deleteObjects: async () => {
        throw new Error('bucket down');
      },
    };

    await expect(runPhotoRetention(testDb.db, failing, new Date())).rejects.toThrow('bucket down');
    expect(await runPhotoRetention(testDb.db, storage, new Date())).toBe(1);
  });
});
