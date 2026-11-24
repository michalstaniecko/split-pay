import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { AvatarUpdate, type Id, PHOTO_LIMITS, PhotoUploadRequest, ReceiptUploadRequest } from '@split-pay/shared';
import { and, count, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import type { Db } from '../db/client';
import { entries, members, type PhotoKind, photos } from '../db/schema';
import type { AuthEnv } from '../middleware/require-user';
import type { ObjectStorage, PresignedUpload } from '../storage/object-storage';
import { findMyGroup } from './group-access';

/**
 * Photos (ADR-0006, SPEC "Photos"): receipt photos of entries and user
 * avatars in a private bucket. The API signs uploads (the phone sends the
 * bytes straight to the bucket) and short-lived read URLs, enforces the
 * limits and decides who may see what:
 * - a receipt: members of its group (never the public web view);
 * - an avatar: its user and everyone sharing a group with them.
 * Routes answer 503 `storage_unavailable` when no bucket is configured.
 *
 * For #27 (reporting/admin): a photo is a `photos` row (`kind`, `uploadedBy`,
 * `groupId`/`entryId` for receipts); remove one with `deletePhotos`, which
 * deletes the object and the row. A removed receipt simply stops being
 * listed (the entry keeps its `receiptPhotoId`).
 */

/** How long a signed read URL works. The app refetches before it runs out. */
export const READ_URL_SECONDS = 10 * 60;
/** How long an upload URL works. */
const UPLOAD_URL_SECONDS = 10 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

type PhotoRow = typeof photos.$inferSelect;
/** A database handle or an open transaction. */
type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

const storageUnavailable = { error: 'storage_unavailable' as const };

const objectKey = (kind: PhotoKind, scopeId: Id, photoId: Id) =>
  `${kind === 'receipt' ? 'receipts' : 'avatars'}/${scopeId}/${photoId}.jpg`;

type IssueResult =
  | { status: 'issued'; photoId: Id; upload: PresignedUpload; expiresAt: string }
  | { status: 'too_large' | 'entry_limit' | 'daily_limit' };

/**
 * Checks the limits and records a photo row for an upload URL. The limits
 * are counted under a per-user advisory lock so parallel requests can't
 * slip past them.
 */
async function issueUpload(
  db: Db,
  storage: ObjectStorage,
  request: { size: number; userId: Id } & ({ kind: 'avatar' } | { kind: 'receipt'; groupId: Id; entryId: Id }),
): Promise<IssueResult> {
  if (request.size > PHOTO_LIMITS.maxBytes) return { status: 'too_large' };
  const now = new Date();
  const photoId = randomUUID();
  const key = objectKey(request.kind, request.kind === 'receipt' ? request.groupId : request.userId, photoId);

  const recorded = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`photos:${request.userId}`}))`);
    const [today] = await tx
      .select({ n: count() })
      .from(photos)
      .where(and(eq(photos.uploadedBy, request.userId), gt(photos.createdAt, new Date(now.getTime() - DAY_MS))));
    if ((today?.n ?? 0) >= PHOTO_LIMITS.maxUploadsPerDay) return 'daily_limit' as const;
    if (request.kind === 'receipt') {
      const [forEntry] = await tx
        .select({ n: count() })
        .from(photos)
        .where(and(eq(photos.entryId, request.entryId), eq(photos.kind, 'receipt')));
      if ((forEntry?.n ?? 0) >= PHOTO_LIMITS.maxUploadsPerEntry) return 'entry_limit' as const;
    }
    await tx.insert(photos).values({
      id: photoId,
      kind: request.kind,
      objectKey: key,
      uploadedBy: request.userId,
      groupId: request.kind === 'receipt' ? request.groupId : null,
      entryId: request.kind === 'receipt' ? request.entryId : null,
      createdAt: now,
    });
    return 'ok' as const;
  });
  if (recorded !== 'ok') return { status: recorded };

  const upload = await storage.presignUpload(key, {
    contentType: 'image/jpeg',
    maxBytes: PHOTO_LIMITS.maxBytes,
    expiresInSeconds: UPLOAD_URL_SECONDS,
  });
  return {
    status: 'issued',
    photoId,
    upload,
    expiresAt: new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000).toISOString(),
  };
}

function issueResponse(c: Context<AuthEnv>, result: IssueResult) {
  switch (result.status) {
    case 'issued':
      return c.json({ photoId: result.photoId, upload: result.upload, expiresAt: result.expiresAt }, 201);
    case 'too_large':
      return c.json({ error: 'photo_too_large' as const, limit: PHOTO_LIMITS.maxBytes }, 413);
    case 'entry_limit':
      return c.json({ error: 'too_many_photos_for_entry' as const, limit: PHOTO_LIMITS.maxUploadsPerEntry }, 429);
    case 'daily_limit':
      return c.json({ error: 'daily_photo_limit' as const, limit: PHOTO_LIMITS.maxUploadsPerDay }, 429);
  }
}

const readExpiry = () => new Date(Date.now() + READ_URL_SECONDS * 1000).toISOString();
const readUrl = (storage: ObjectStorage, key: string) =>
  storage.signedReadUrl(key, { expiresInSeconds: READ_URL_SECONDS });

/**
 * Marks a receipt photo as used by an entry of `groupId`. False when the id
 * is not a receipt uploaded into this group — the entry is then invalid.
 * Called by `createEntry` / `editEntry` inside their transaction.
 */
export async function attachReceipt(tx: Pick<Db, 'update'>, groupId: Id, photoId: Id): Promise<boolean> {
  const rows = await tx
    .update(photos)
    .set({ attachedAt: sql`coalesce(${photos.attachedAt}, now())` })
    .where(and(eq(photos.id, photoId), eq(photos.groupId, groupId), eq(photos.kind, 'receipt')))
    .returning({ id: photos.id });
  return rows.length > 0;
}

/**
 * Deletes photos: objects first, then rows — if the bucket refuses, the rows
 * stay and the retention job tries again. Without storage only rows go.
 */
export async function deletePhotos(db: Tx, storage: ObjectStorage | undefined, rows: readonly PhotoRow[]) {
  if (rows.length === 0) return;
  await storage?.deleteObjects(rows.map((r) => r.objectKey));
  await db.delete(photos).where(
    inArray(
      photos.id,
      rows.map((r) => r.id),
    ),
  );
}

/**
 * Receipt photos of a group, mounted at `/groups/:groupId/receipts` (inside
 * the groups sub-app: signed in, archived groups read-only).
 */
export const receiptRoutes = ({ db, storage }: { db: Db; storage: ObjectStorage | undefined }) =>
  new Hono<AuthEnv>()
    /** Read URLs of the receipts of the group's live entries (thumbnails, entry detail). */
    .get('/', async (c) => {
      const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      if (!storage) return c.json(storageUnavailable, 503);
      const rows = await db
        .select({ photoId: photos.id, entryId: entries.id, key: photos.objectKey })
        .from(entries)
        .innerJoin(photos, and(eq(photos.id, entries.receiptPhotoId), eq(photos.groupId, group.id)))
        .where(and(eq(entries.groupId, group.id), isNull(entries.deletedAt)));
      const expiresAt = readExpiry();
      const receipts = await Promise.all(
        rows.map(async (r) => ({ photoId: r.photoId, entryId: r.entryId, url: await readUrl(storage, r.key) })),
      );
      return c.json({ receipts, expiresAt }, 200);
    })
    /**
     * An upload URL for a receipt of entry `entryId` (which may not exist
     * yet). 201; 413 `photo_too_large`; 429 `too_many_photos_for_entry` /
     * `daily_photo_limit`; 404 non-member; 409 archived group.
     */
    .post('/uploads', zValidator('json', ReceiptUploadRequest), async (c) => {
      const userId = c.get('user').id;
      const group = await findMyGroup(db, c.req.param('groupId'), userId);
      if (!group) return c.json({ error: 'not_found' as const }, 404);
      if (!storage) return c.json(storageUnavailable, 503);
      const { size, entryId } = c.req.valid('json');
      return issueResponse(c, await issueUpload(db, storage, { kind: 'receipt', size, userId, groupId: group.id, entryId }));
    });

/** Avatars of a group's members (`/groups/:groupId/avatars`), for everyone in the group. */
export const groupAvatarRoutes = ({ db, storage }: { db: Db; storage: ObjectStorage | undefined }) =>
  new Hono<AuthEnv>().get('/', async (c) => {
    const group = await findMyGroup(db, c.req.param('groupId'), c.get('user').id);
    if (!group) return c.json({ error: 'not_found' as const }, 404);
    if (!storage) return c.json(storageUnavailable, 503);
    const rows = await db
      .select({ memberId: members.id, photoId: photos.id, key: photos.objectKey })
      .from(members)
      .innerJoin(
        photos,
        and(eq(photos.uploadedBy, members.userId), eq(photos.kind, 'avatar'), isNotNull(photos.attachedAt)),
      )
      .where(eq(members.groupId, group.id));
    const expiresAt = readExpiry();
    const avatars = await Promise.all(
      rows.map(async (r) => ({ memberId: r.memberId, photoId: r.photoId, url: await readUrl(storage, r.key) })),
    );
    return c.json({ avatars, expiresAt }, 200);
  });

/** The current avatar of a user (at most one attached avatar photo). */
async function currentAvatars(db: Tx, userId: Id) {
  return db
    .select()
    .from(photos)
    .where(and(eq(photos.uploadedBy, userId), eq(photos.kind, 'avatar'), isNotNull(photos.attachedAt)));
}

/** My avatar (Profile), mounted at `/me/avatar`. */
export const myAvatarRoutes = ({
  db,
  requireUser,
  storage,
}: {
  db: Db;
  requireUser: MiddlewareHandler<AuthEnv>;
  storage: ObjectStorage | undefined;
}) => {
  const avatarDto = async (s: ObjectStorage, row: PhotoRow | undefined) =>
    row ? { photoId: row.id, url: await readUrl(s, row.objectKey), expiresAt: readExpiry() } : null;

  return (
    new Hono<AuthEnv>()
      .use(requireUser)
      .get('/', async (c) => {
        if (!storage) return c.json(storageUnavailable, 503);
        const [row] = await currentAvatars(db, c.get('user').id);
        return c.json({ avatar: await avatarDto(storage, row) }, 200);
      })
      /** An upload URL for a new avatar; set it with `PUT /me/avatar` after uploading. */
      .post('/uploads', zValidator('json', PhotoUploadRequest), async (c) => {
        if (!storage) return c.json(storageUnavailable, 503);
        const { size } = c.req.valid('json');
        return issueResponse(c, await issueUpload(db, storage, { kind: 'avatar', size, userId: c.get('user').id }));
      })
      /** Makes an uploaded photo my avatar; the previous one is deleted. 404 for someone else's photo. */
      .put('/', zValidator('json', AvatarUpdate), async (c) => {
        if (!storage) return c.json(storageUnavailable, 503);
        const userId = c.get('user').id;
        const { photoId } = c.req.valid('json');
        const [row] = await db
          .update(photos)
          .set({ attachedAt: new Date() })
          .where(and(eq(photos.id, photoId), eq(photos.uploadedBy, userId), eq(photos.kind, 'avatar')))
          .returning();
        if (!row) return c.json({ error: 'not_found' as const }, 404);
        const previous = (await currentAvatars(db, userId)).filter((p) => p.id !== row.id);
        await deletePhotos(db, storage, previous);
        return c.json({ avatar: await avatarDto(storage, row) }, 200);
      })
      /** Removes my avatar (members show the initial again). */
      .delete('/', async (c) => {
        if (!storage) return c.json(storageUnavailable, 503);
        await deletePhotos(db, storage, await currentAvatars(db, c.get('user').id));
        return c.json({ avatar: null }, 200);
      })
  );
};

/** Avatar photos of an account, for `deleteAccount` (ADR-0010: personal data goes). */
export async function avatarPhotosOf(db: Tx, userId: Id) {
  return db
    .select()
    .from(photos)
    .where(and(eq(photos.uploadedBy, userId), eq(photos.kind, 'avatar')));
}
