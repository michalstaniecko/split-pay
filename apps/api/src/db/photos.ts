import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { groups } from './groups';

export type PhotoKind = 'receipt' | 'avatar';

/**
 * Photos in object storage (ADR-0006): one row per issued upload, created
 * when the API signs the upload URL. The bytes live in the bucket under
 * `objectKey`; rows and objects are removed together (`deletePhotos`).
 *
 * - receipt: `groupId` + `entryId` (the client-generated entry id it was
 *   uploaded for). `attachedAt` is set when an entry first references it
 *   (`entries.receiptPhotoId`); replaced receipts are kept for the change
 *   history until the group's retention.
 * - avatar: `attachedAt` set = the user's current avatar (at most one).
 *
 * `uploadedBy` counts the daily upload limit and goes null with the account;
 * a deleted group leaves `groupId` null. The daily retention job removes
 * receipts of groups archived over a year ago, orphans and uploads never
 * attached (`routes/photos.ts` → `runPhotoRetention`).
 */
export const photos = pgTable(
  'photos',
  {
    id: uuid().primaryKey(),
    kind: text().$type<PhotoKind>().notNull(),
    objectKey: text().notNull().unique(),
    uploadedBy: uuid().references(() => user.id, { onDelete: 'set null' }),
    groupId: uuid().references(() => groups.id, { onDelete: 'set null' }),
    entryId: uuid(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    attachedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('photos_group_id_idx').on(t.groupId),
    index('photos_entry_id_idx').on(t.entryId),
    index('photos_uploaded_by_created_at_idx').on(t.uploadedBy, t.createdAt),
    check('photos_kind_check', sql`${t.kind} in ('receipt', 'avatar')`),
  ],
);
