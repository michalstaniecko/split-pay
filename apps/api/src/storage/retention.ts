import { receiptRetentionCutoff } from '@split-pay/shared';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { groups, photos } from '../db/schema';
import { deletePhotos } from '../routes/photos';
import type { ObjectStorage } from './object-storage';

/** An upload not attached to an entry or set as avatar within this time is abandoned. */
const UNATTACHED_GRACE_MS = 24 * 60 * 60 * 1000;
const BATCH = 500;

/**
 * The daily photo cleanup (SPEC "Photos", ADR-0006). Deletes, from the bucket
 * and then the table:
 * - receipt photos of groups archived more than `RECEIPT_RETENTION_DAYS` ago;
 * - receipt photos of deleted groups (`groupId` went null);
 * - uploads never attached to an entry or set as avatar, after a day;
 * - avatars of deleted accounts the account deletion couldn't remove.
 * Replaced receipts of live groups stay (change history). Returns how many
 * photos were deleted. A bucket error stops the run; rows stay for next time.
 */
export async function runPhotoRetention(db: Db, storage: ObjectStorage, now: Date): Promise<number> {
  const archivedLongAgo = db
    .select({ id: groups.id })
    .from(groups)
    .where(lt(groups.archivedAt, receiptRetentionCutoff(now)));
  const due = or(
    and(eq(photos.kind, 'receipt'), or(isNull(photos.groupId), inArray(photos.groupId, archivedLongAgo))),
    and(isNull(photos.attachedAt), lt(photos.createdAt, new Date(now.getTime() - UNATTACHED_GRACE_MS))),
    and(eq(photos.kind, 'avatar'), isNull(photos.uploadedBy)),
  );

  let deleted = 0;
  for (;;) {
    const rows = await db.select().from(photos).where(due).limit(BATCH);
    if (rows.length === 0) return deleted;
    await deletePhotos(db, storage, rows);
    deleted += rows.length;
  }
}

/**
 * Runs `runPhotoRetention` shortly after start and then once a day. Started
 * in `index.ts` only (never in tests). Returns a function stopping the job.
 */
export function startPhotoRetentionJob(options: {
  db: Db;
  storage: ObjectStorage;
  intervalMs?: number;
  log?: (message: string, error?: unknown) => void;
  /** Called with the error of a failed run (error reporting, #64). */
  onError?: (error: unknown) => void;
}): () => void {
  const { db, storage, intervalMs = 24 * 60 * 60 * 1000, log = console.log, onError } = options;
  const run = async () => {
    try {
      const deleted = await runPhotoRetention(db, storage, new Date());
      if (deleted > 0) log(`[photos] retention deleted ${deleted} photo(s)`);
    } catch (error) {
      log('[photos] retention failed', error);
      onError?.(error);
    }
  };
  const first = setTimeout(() => void run(), 60_000);
  first.unref();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
