import { randomUUID } from 'node:crypto';
import type { NewEntry, PhotoReportRequest } from '@split-pay/shared';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

type Session = { cookie: string; userId: string };

const ADMIN = 'moderator@example.com';

describe('content reporting, admin panel, account blocking (#27)', () => {
  const { app, signIn, client, storage, json } = createTestApp({ adminEmails: [ADMIN] });

  /**
   * Ania's group which Bartek joined, with Ania's receipt on an expense and
   * Bartek's avatar. Celina shares no group with them.
   */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const celina = await signIn('celina@example.com');
    const admin = await signIn(ADMIN);
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const groupId = group.id;
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId } }));
    await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));

    const entryId = randomUUID();
    const issuedReceipt = await parseResponse(
      client(ania).groups[':groupId'].receipts.uploads.$post({
        param: { groupId },
        json: { entryId, contentType: 'image/jpeg', size: 1000 },
      }),
    );
    storage.put(issuedReceipt.upload);
    const me = group.ownerMemberId;
    const expense: NewEntry = {
      kind: 'expense',
      id: entryId,
      date: '2026-07-11',
      title: 'Zakupy',
      amount: 12_000,
      currency: 'PLN',
      rateToBase: '1',
      category: 'groceries',
      receiptPhotoId: issuedReceipt.photoId,
      payers: [{ memberId: me, amount: 12_000 }],
      split: { mode: 'equal', memberIds: [me] },
    };
    await parseResponse(client(ania).groups[':groupId'].entries.$post({ param: { groupId }, json: expense }));

    const issuedAvatar = await parseResponse(
      client(bartek).me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 1000 } }),
    );
    storage.put(issuedAvatar.upload);
    await parseResponse(client(bartek).me.avatar.$put({ json: { photoId: issuedAvatar.photoId } }));

    return {
      ania,
      bartek,
      celina,
      admin,
      groupId,
      receipt: { photoId: issuedReceipt.photoId, key: issuedReceipt.upload.fields.key! },
      avatar: { photoId: issuedAvatar.photoId, key: issuedAvatar.upload.fields.key! },
    };
  }

  const report = (session: Session, body: Partial<PhotoReportRequest> & { photoId: string }) =>
    client(session).reports.$post({ json: { reason: 'sexual', ...body } as PhotoReportRequest });
  const openReports = async (session: Session) => parseResponse(client(session).admin.reports.$get());

  describe('reporting', () => {
    it('a member reports a receipt photo and a group mate reports an avatar, with a reason', async () => {
      const { ania, bartek, admin, receipt, avatar } = await setup();

      const res = await report(bartek, { photoId: receipt.photoId, reason: 'violence', details: 'gore' });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ reported: true });
      expect((await report(ania, { photoId: avatar.photoId, reason: 'harassment' })).status).toBe(201);

      const { reports } = await openReports(admin);
      expect(reports).toHaveLength(2);
      expect(reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'violence',
            details: 'gore',
            reporter: { id: bartek.userId, email: 'bartek@example.com' },
            reportedUser: expect.objectContaining({ id: ania.userId, email: 'ania@example.com', blocked: false }),
            photo: expect.objectContaining({ id: receipt.photoId, kind: 'receipt', url: expect.stringContaining(receipt.key) }),
          }),
          expect.objectContaining({
            reason: 'harassment',
            reportedUser: expect.objectContaining({ id: bartek.userId }),
            photo: expect.objectContaining({ id: avatar.photoId, kind: 'avatar' }),
          }),
        ]),
      );
    });

    it('reporting the same photo twice keeps one open report', async () => {
      const { bartek, admin, receipt } = await setup();
      await report(bartek, { photoId: receipt.photoId });
      expect((await report(bartek, { photoId: receipt.photoId, reason: 'spam' })).status).toBe(201);
      expect((await openReports(admin)).reports).toHaveLength(1);
    });

    it("can't report photos the reporter can't see (404, existence not revealed) or while signed out", async () => {
      const { celina, admin, receipt, avatar } = await setup();
      expect((await report(celina, { photoId: receipt.photoId })).status).toBe(404);
      expect((await report(celina, { photoId: avatar.photoId })).status).toBe(404);
      expect((await report(celina, { photoId: randomUUID() })).status).toBe(404);
      expect(
        (await app.request('/reports', json({ photoId: receipt.photoId, reason: 'spam' }))).status,
      ).toBe(401);
      expect((await openReports(admin)).reports).toEqual([]);
    });

    it('a report gives the reporter nothing new: no admin data, no access to the photo', async () => {
      const { bartek, celina, avatar } = await setup();
      // Celina can't see Bartek's avatar; reporting doesn't change that.
      await report(bartek, { photoId: avatar.photoId });
      expect((await client(bartek).admin.reports.$get()).status).toBe(403);
      expect((await client(celina).groups.$get()).status).toBe(200);
      expect((await report(celina, { photoId: avatar.photoId })).status).toBe(404);
    });
  });

  describe('admin access', () => {
    it('only admins from the allowlist reach the admin panel; /me tells the app', async () => {
      const { ania, admin } = await setup();
      expect((await client(ania).admin.reports.$get()).status).toBe(403);
      expect((await app.request('/admin/reports')).status).toBe(401);
      expect((await client(admin).admin.reports.$get()).status).toBe(200);
      expect((await parseResponse(client(admin).me.$get())).isAdmin).toBe(true);
      expect((await parseResponse(client(ania).me.$get())).isAdmin).toBe(false);
    });

    it('non-admins cannot remove photos or block accounts', async () => {
      const { ania, bartek, receipt } = await setup();
      const remove = await client(bartek).admin.photos[':photoId'].$delete({ param: { photoId: receipt.photoId } });
      expect(remove.status).toBe(403);
      const block = await client(bartek).admin.users[':userId'].block.$post({
        param: { userId: ania.userId },
        json: { reason: '' },
      });
      expect(block.status).toBe(403);
      expect(storage.objects.has(receipt.key)).toBe(true);
    });
  });

  describe('moderation', () => {
    it('removing a reported photo deletes it from storage, closes its reports and drops it from the receipts list', async () => {
      const { ania, bartek, admin, groupId, receipt } = await setup();
      await report(bartek, { photoId: receipt.photoId });

      const res = await client(admin).admin.photos[':photoId'].$delete({ param: { photoId: receipt.photoId } });
      expect(res.status).toBe(200);
      expect(storage.objects.has(receipt.key)).toBe(false);
      expect((await openReports(admin)).reports).toEqual([]);
      const { receipts } = await parseResponse(
        client(ania).groups[':groupId'].receipts.$get({ param: { groupId } }),
      );
      expect(receipts).toEqual([]);
      expect(
        (await client(admin).admin.photos[':photoId'].$delete({ param: { photoId: receipt.photoId } })).status,
      ).toBe(404);
    });

    it('removing a reported avatar clears it for the group', async () => {
      const { ania, bartek, admin, groupId, avatar } = await setup();
      await report(ania, { photoId: avatar.photoId });
      await client(admin).admin.photos[':photoId'].$delete({ param: { photoId: avatar.photoId } });
      expect((await parseResponse(client(bartek).me.avatar.$get())).avatar).toBeNull();
      const { avatars } = await parseResponse(client(ania).groups[':groupId'].avatars.$get({ param: { groupId } }));
      expect(avatars).toEqual([]);
    });

    it('dismissing a report closes it and keeps the photo', async () => {
      const { bartek, admin, receipt } = await setup();
      await report(bartek, { photoId: receipt.photoId });
      const [open] = (await openReports(admin)).reports;
      const res = await client(admin).admin.reports[':reportId'].dismiss.$post({ param: { reportId: open!.id } });
      expect(res.status).toBe(200);
      expect((await openReports(admin)).reports).toEqual([]);
      expect(storage.objects.has(receipt.key)).toBe(true);
    });
  });

  describe('blocking', () => {
    const block = (admin: Session, userId: string) =>
      client(admin).admin.users[':userId'].block.$post({ param: { userId }, json: { reason: 'repeated nudity' } });

    it('a blocked account is rejected by the API and can be unblocked', async () => {
      const { ania, admin } = await setup();
      expect((await block(admin, ania.userId)).status).toBe(200);

      // Existing sessions stop working...
      expect((await client(ania).groups.$get()).status).toBe(401);
      // ...and a new sign-in reaches only account deletion (#48).
      const blockedSession = await signIn('ania@example.com');
      expect((await client(blockedSession).groups.$get()).status).toBe(403);

      const { blocked } = await parseResponse(client(admin).admin.users.blocked.$get());
      expect(blocked).toEqual([
        expect.objectContaining({ id: ania.userId, email: 'ania@example.com', reason: 'repeated nudity', blockedBy: ADMIN }),
      ]);

      expect((await client(admin).admin.users[':userId'].block.$delete({ param: { userId: ania.userId } })).status).toBe(
        200,
      );
      const again = await signIn('ania@example.com');
      expect((await client(again).groups.$get()).status).toBe(200);
      expect((await parseResponse(client(admin).admin.users.blocked.$get())).blocked).toEqual([]);
    });

    it('a blocked account cannot upload photos or set an avatar', async () => {
      const { bartek, admin, groupId } = await setup();
      const pending = await parseResponse(
        client(bartek).me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 1000 } }),
      );
      await block(admin, bartek.userId);
      expect(
        (await client(bartek).me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 1000 } })).status,
      ).toBe(401);
      expect(
        (
          await client(bartek).groups[':groupId'].receipts.uploads.$post({
            param: { groupId },
            json: { entryId: randomUUID(), contentType: 'image/jpeg', size: 1000 },
          })
        ).status,
      ).toBe(401);
      expect((await client(bartek).me.avatar.$put({ json: { photoId: pending.photoId } })).status).toBe(401);
    });

    it('the report list shows whether the reported account is blocked', async () => {
      const { ania, bartek, admin, receipt } = await setup();
      await report(bartek, { photoId: receipt.photoId });
      await block(admin, ania.userId);
      const [open] = (await openReports(admin)).reports;
      expect(open?.reportedUser?.blocked).toBe(true);
    });

    it('admins cannot block themselves; unknown accounts are 404', async () => {
      const { admin } = await setup();
      expect((await block(admin, admin.userId)).status).toBe(400);
      expect((await block(admin, randomUUID())).status).toBe(404);
    });
  });
});
