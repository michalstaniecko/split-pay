import { randomUUID } from 'node:crypto';
import { type NewEntry, PHOTO_LIMITS } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

const newGroup = () => ({
  id: randomUUID(),
  name: 'Mazury',
  emoji: '⛵',
  color: '#1E88E5',
  baseCurrency: 'PLN',
  startDate: '2026-07-10',
  endDate: '2026-07-14',
});

type Session = { cookie: string; userId: string };

describe('receipt photos (ADR-0006)', () => {
  const { app, signIn, client, storage } = createTestApp();

  /** Ania's trip which Bartek joined; Celina is signed in but not a member. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const celina = await signIn('celina@example.com');
    const group = await parseResponse(client(ania).groups.$post({ json: newGroup() }));
    const groupId = group.id;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const me = group.ownerMemberId;
    const expense = (receiptPhotoId: string | null, id: string = randomUUID()): NewEntry => ({
      kind: 'expense',
      id,
      date: '2026-07-11',
      title: 'Zakupy',
      amount: 12_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'groceries',
      receiptPhotoId,
      payers: [{ memberId: me, amount: 12_000 }],
      split: { mode: 'equal', memberIds: [me] },
    });
    const receipts = (session: Session) => client(session).groups[':groupId'].receipts;
    const requestUpload = (session: Session, body: { entryId: string; size?: number }, gid = groupId) =>
      receipts(session).uploads.$post({
        param: { groupId: gid },
        json: { entryId: body.entryId, contentType: 'image/jpeg', size: body.size ?? 400_000 },
      });
    const complete = (session: Session, photoId: string, gid = groupId) =>
      receipts(session).uploads[':photoId'].complete.$post({ param: { groupId: gid, photoId } });
    /** Upload URL + the phone's upload to the bucket + completing it. */
    async function upload(session: Session, entryId: string) {
      const issued = await parseResponse(requestUpload(session, { entryId }));
      storage.put(issued.upload);
      await parseResponse(complete(session, issued.photoId));
      return issued.photoId;
    }
    const createEntry = (session: Session, input: NewEntry) =>
      client(session).groups[':groupId'].entries.$post({ param: { groupId }, json: input });
    const list = (session: Session) => receipts(session).$get({ param: { groupId } });
    return { ania, bartek, celina, groupId, expense, requestUpload, complete, upload, createEntry, list };
  }

  it('issues a private upload into the group and shows the attached receipt to members via a short-lived URL', async () => {
    const { ania, bartek, expense, requestUpload, complete, createEntry, list } = await setup();
    const entryId = randomUUID();

    const res = await requestUpload(ania, { entryId });
    if (res.status !== 201) throw new Error(`upload URL → ${res.status}`);
    const issued = await res.json();
    expect(issued.upload).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/jpeg' } });
    expect(storage.keyOf(issued.upload)).toMatch(new RegExp(`^receipts/.+/${issued.photoId}\\.jpg$`));
    storage.put(issued.upload);
    expect(await parseResponse(complete(ania, issued.photoId))).toEqual({ photoId: issued.photoId });

    expect((await createEntry(ania, expense(issued.photoId, entryId))).status).toBe(201);

    const seen = await parseResponse(list(bartek));
    expect(seen.receipts).toEqual([
      { photoId: issued.photoId, entryId, url: expect.stringContaining(storage.keyOf(issued.upload)) },
    ]);
    const expiresIn = new Date(seen.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(0);
    expect(expiresIn).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('gives non-members and signed-out visitors nothing', async () => {
    const { ania, celina, groupId, expense, upload, createEntry, list, requestUpload } = await setup();
    const entryId = randomUUID();
    await createEntry(ania, expense(await upload(ania, entryId), entryId));

    expect((await list(celina)).status).toBe(404);
    expect((await requestUpload(celina, { entryId: randomUUID() })).status).toBe(404);
    expect((await app.request(`/groups/${groupId}/receipts`)).status).toBe(401);
  });

  it('does not list receipts of deleted entries or uploads never attached', async () => {
    const { ania, groupId, expense, upload, createEntry, list } = await setup();
    await upload(ania, randomUUID());
    const entryId = randomUUID();
    const created = await parseResponse(createEntry(ania, expense(await upload(ania, entryId), entryId)));
    await client(ania).groups[':groupId'].entries[':entryId'].$delete({
      param: { groupId, entryId },
      query: { baseVersion: String(created.version) },
    });

    expect((await parseResponse(list(ania))).receipts).toEqual([]);
  });

  it("rejects an entry pointing at another group's photo or at an avatar", async () => {
    const first = await setup();
    const otherGroup = await parseResponse(client(first.ania).groups.$post({ json: newGroup() }));
    const foreign = await parseResponse(
      first.requestUpload(first.ania, { entryId: randomUUID() }, otherGroup.id),
    );
    const avatar = await parseResponse(
      client(first.ania).me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 1000 } }),
    );

    for (const photoId of [foreign.photoId, avatar.photoId, randomUUID()]) {
      const res = await first.createEntry(first.ania, first.expense(photoId));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_entry' });
    }
  });

  it('lets an edit replace the receipt', async () => {
    const { ania, groupId, expense, upload, createEntry, list } = await setup();
    const entryId = randomUUID();
    const created = await parseResponse(createEntry(ania, expense(await upload(ania, entryId), entryId)));
    const replacement = await upload(ania, entryId);

    const res = await client(ania).groups[':groupId'].entries[':entryId'].$put({
      param: { groupId, entryId },
      json: { baseVersion: created.version, entry: expense(replacement, entryId) },
    });
    expect(res.status).toBe(200);
    expect((await parseResponse(list(ania))).receipts.map((r) => r.photoId)).toEqual([replacement]);
  });

  describe('checking the uploaded object (a PUT URL cannot limit it, ADR-0020)', () => {
    async function issued(session: Session, setupResult: Awaited<ReturnType<typeof setup>>) {
      return parseResponse(setupResult.requestUpload(session, { entryId: randomUUID() }));
    }

    it.each([
      ['larger than the limit', { size: PHOTO_LIMITS.maxBytes + 1 }, 'photo_too_large'],
      ['not a JPEG', { contentType: 'image/png' }, 'photo_upload_invalid'],
      ['empty', { size: 0 }, 'photo_upload_invalid'],
    ] as const)('refuses an object %s, deletes it and its row', async (_, file, error) => {
      const s = await setup();
      const upload = await issued(s.ania, s);
      storage.put(upload.upload, file);

      const res = await s.complete(s.ania, upload.photoId);
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error });
      expect(storage.objects.has(storage.keyOf(upload.upload))).toBe(false);
      // The photo is gone: completing again or attaching it fails.
      expect((await s.complete(s.ania, upload.photoId)).status).toBe(404);
      expect((await s.createEntry(s.ania, s.expense(upload.photoId))).status).toBe(400);
    });

    it('refuses completing an upload that never reached the bucket', async () => {
      const s = await setup();
      const upload = await issued(s.ania, s);
      const res = await s.complete(s.ania, upload.photoId);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ error: 'photo_upload_invalid' });
    });

    it('an entry cannot use an upload that was not completed', async () => {
      const s = await setup();
      const upload = await issued(s.ania, s);
      storage.put(upload.upload);
      const res = await s.createEntry(s.ania, s.expense(upload.photoId));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_entry' });
    });

    it('checks an object once: completing again is fine and does not look at the bucket', async () => {
      const s = await setup();
      const upload = await issued(s.ania, s);
      storage.put(upload.upload);
      expect((await s.complete(s.ania, upload.photoId)).status).toBe(200);
      // Even if the object changed afterwards, the recorded check stands.
      storage.put(upload.upload, { size: PHOTO_LIMITS.maxBytes + 1 });
      expect((await s.complete(s.ania, upload.photoId)).status).toBe(200);
    });

    it("only the uploader completes an upload, and only in the photo's group", async () => {
      const s = await setup();
      const upload = await issued(s.ania, s);
      storage.put(upload.upload);
      expect((await s.complete(s.bartek, upload.photoId)).status).toBe(404);
      expect((await s.complete(s.celina, upload.photoId)).status).toBe(404);
      expect((await s.complete(s.ania, randomUUID())).status).toBe(404);
      expect(storage.objects.has(storage.keyOf(upload.upload))).toBe(true);
    });
  });

  describe('limits (answered with error codes the app translates)', () => {
    it('refuses a file over the size limit', async () => {
      const { ania, requestUpload } = await setup();
      const res = await requestUpload(ania, { entryId: randomUUID(), size: PHOTO_LIMITS.maxBytes + 1 });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: 'photo_too_large', limit: PHOTO_LIMITS.maxBytes });
    });

    it('caps the uploads for one entry', async () => {
      const { ania, bartek, requestUpload } = await setup();
      const entryId = randomUUID();
      for (let i = 0; i < PHOTO_LIMITS.maxUploadsPerEntry; i++) {
        expect((await requestUpload(i % 2 ? ania : bartek, { entryId })).status).toBe(201);
      }
      const res = await requestUpload(ania, { entryId });
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: 'too_many_photos_for_entry', limit: PHOTO_LIMITS.maxUploadsPerEntry });
      expect((await requestUpload(ania, { entryId: randomUUID() })).status).toBe(201);
    });

    it('caps the uploads per account per day, avatars included', async () => {
      const { ania, bartek, requestUpload } = await setup();
      const avatarUpload = () =>
        client(ania).me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 1000 } });
      expect((await avatarUpload()).status).toBe(201);
      for (let i = 1; i < PHOTO_LIMITS.maxUploadsPerDay; i++) {
        expect((await requestUpload(ania, { entryId: randomUUID() })).status).toBe(201);
      }

      const res = await requestUpload(ania, { entryId: randomUUID() });
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: 'daily_photo_limit', limit: PHOTO_LIMITS.maxUploadsPerDay });
      expect((await avatarUpload()).status).toBe(429);
      // Someone else's limit is their own.
      expect((await requestUpload(bartek, { entryId: randomUUID() })).status).toBe(201);
    });
  });

  it('refuses uploads into an archived group but still shows its receipts', async () => {
    const { ania, groupId, expense, upload, createEntry, list, requestUpload } = await setup();
    const entryId = randomUUID();
    await createEntry(ania, expense(await upload(ania, entryId), entryId));
    await client(ania).groups[':groupId'].archive.$put({ param: { groupId } });

    expect((await requestUpload(ania, { entryId: randomUUID() })).status).toBe(409);
    expect((await parseResponse(list(ania))).receipts).toHaveLength(1);
  });
});

describe('photos without configured storage', () => {
  it('answers 503 storage_unavailable', async () => {
    const { signIn, client } = createTestApp({ storage: null });
    const ania = await signIn('ania@example.com');
    const res = await client(ania).me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 1000 } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'storage_unavailable' });
  });
});
