import { randomUUID } from 'node:crypto';
import { parseResponse } from 'hono/client';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test/app';

type Session = { cookie: string; userId: string };

describe('avatars (ADR-0006)', () => {
  const { app, signIn, client, storage } = createTestApp();

  async function uploadAvatar(session: Session) {
    const issued = await parseResponse(
      client(session).me.avatar.uploads.$post({ json: { contentType: 'image/jpeg', size: 50_000 } }),
    );
    storage.put(issued.upload);
    return issued;
  }
  const setAvatar = (session: Session, photoId: string) => client(session).me.avatar.$put({ json: { photoId } });
  const myAvatar = (session: Session) => parseResponse(client(session).me.avatar.$get());

  /** Ania's trip which Bartek joined; Celina is in no group with them. */
  async function setup() {
    const ania = await signIn('ania@example.com');
    const bartek = await signIn('bartek@example.com');
    const celina = await signIn('celina@example.com');
    const group = await parseResponse(
      client(ania).groups.$post({
        json: { id: randomUUID(), name: 'Mazury', emoji: '⛵', color: '#1E88E5', baseCurrency: 'PLN', startDate: null, endDate: null },
      }),
    );
    const { token } = await parseResponse(client(ania).groups[':groupId'].link.$get({ param: { groupId: group.id } }));
    const { memberId: bartekMemberId } = await parseResponse(client(bartek).links[':token'].join.$post({ param: { token } }));
    const groupAvatars = (session: Session) => client(session).groups[':groupId'].avatars.$get({ param: { groupId: group.id } });
    return { ania, bartek, celina, group, bartekMemberId, groupAvatars };
  }

  it('sets my avatar from an upload and shows it in Profile', async () => {
    const { ania } = await setup();
    expect((await myAvatar(ania)).avatar).toBeNull();
    const issued = await uploadAvatar(ania);
    expect(issued.upload.fields.key).toBe(`avatars/${ania.userId}/${issued.photoId}.jpg`);

    expect((await setAvatar(ania, issued.photoId)).status).toBe(200);
    expect((await myAvatar(ania)).avatar).toEqual({
      photoId: issued.photoId,
      url: expect.stringContaining(issued.upload.fields.key!),
      expiresAt: expect.any(String),
    });
  });

  it('shows avatars next to members to everyone in the group, and to nobody else', async () => {
    const { bartek, celina, group, bartekMemberId, groupAvatars } = await setup();
    const issued = await uploadAvatar(bartek);
    await setAvatar(bartek, issued.photoId);

    const seen = await parseResponse(groupAvatars(bartek));
    expect(seen.avatars).toEqual([{ memberId: bartekMemberId, url: expect.stringContaining(issued.photoId) }]);
    expect((await groupAvatars(celina)).status).toBe(404);
    expect((await app.request(`/groups/${group.id}/avatars`)).status).toBe(401);
  });

  it("can't use someone else's upload or a receipt as my avatar", async () => {
    const { ania, bartek, group } = await setup();
    const bartekUpload = await uploadAvatar(bartek);
    const receipt = await parseResponse(
      client(ania).groups[':groupId'].receipts.uploads.$post({
        param: { groupId: group.id },
        json: { entryId: randomUUID(), contentType: 'image/jpeg', size: 1000 },
      }),
    );
    expect((await setAvatar(ania, bartekUpload.photoId)).status).toBe(404);
    expect((await setAvatar(ania, receipt.photoId)).status).toBe(404);
    expect((await myAvatar(ania)).avatar).toBeNull();
  });

  it('a new avatar replaces the old one, which is deleted from storage', async () => {
    const { ania } = await setup();
    const first = await uploadAvatar(ania);
    await setAvatar(ania, first.photoId);
    const second = await uploadAvatar(ania);
    await setAvatar(ania, second.photoId);

    expect((await myAvatar(ania)).avatar?.photoId).toBe(second.photoId);
    expect(storage.objects.has(first.upload.fields.key!)).toBe(false);
    expect(storage.objects.has(second.upload.fields.key!)).toBe(true);
  });

  it('removing my avatar deletes it from storage', async () => {
    const { ania } = await setup();
    const issued = await uploadAvatar(ania);
    await setAvatar(ania, issued.photoId);

    expect((await client(ania).me.avatar.$delete()).status).toBe(200);
    expect((await myAvatar(ania)).avatar).toBeNull();
    expect(storage.objects.has(issued.upload.fields.key!)).toBe(false);
  });

  it('deleting the account deletes the avatar from storage (ADR-0010)', async () => {
    const { ania, bartek, groupAvatars } = await setup();
    const issued = await uploadAvatar(bartek);
    await setAvatar(bartek, issued.photoId);

    expect((await client(bartek).me.$delete({ json: { locale: 'pl' } })).status).toBe(200);
    expect(storage.objects.has(issued.upload.fields.key!)).toBe(false);
    expect((await parseResponse(groupAvatars(ania))).avatars).toEqual([]);
  });
});
