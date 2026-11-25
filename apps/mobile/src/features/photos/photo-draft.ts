import type { PhotoError } from '@split-pay/shared';
import { DetailedError } from 'hono/client';

/** A photo prepared on the phone: downscaled, re-encoded to JPEG (no EXIF), ready to upload. */
export interface LocalPhoto {
  uri: string;
  /** Bytes. */
  size: number;
  width: number;
  height: number;
}

/**
 * The receipt field of the full expense form:
 * - `none`: no receipt;
 * - `stored`: the entry's current receipt (edit mode);
 * - `local`: a photo just taken or picked, not uploaded yet;
 * - `uploaded`: a local photo already in the bucket (a retried save reuses it).
 */
export type ReceiptDraft =
  | { kind: 'none' }
  | { kind: 'stored'; photoId: string }
  | { kind: 'local'; photo: LocalPhoto }
  | { kind: 'uploaded'; photoId: string; photo: LocalPhoto };

export const noReceipt: ReceiptDraft = { kind: 'none' };

export function receiptDraftFromEntry(entry: { receiptPhotoId: string | null } | undefined): ReceiptDraft {
  return entry?.receiptPhotoId ? { kind: 'stored', photoId: entry.receiptPhotoId } : noReceipt;
}

/** The entry's `receiptPhotoId`; `undefined` while a local photo still has to be uploaded. */
export function receiptPhotoIdToSave(draft: ReceiptDraft): string | null | undefined {
  switch (draft.kind) {
    case 'none':
      return null;
    case 'local':
      return undefined;
    case 'stored':
    case 'uploaded':
      return draft.photoId;
  }
}

export function withUploadedReceipt(draft: ReceiptDraft, photoId: string): ReceiptDraft {
  return draft.kind === 'local' ? { kind: 'uploaded', photoId, photo: draft.photo } : draft;
}

/** What to show in the form: the photo on the device, or the stored one's signed URL (when known). */
export function receiptPreviewUri(draft: ReceiptDraft, storedUrl: string | undefined): string | null {
  switch (draft.kind) {
    case 'none':
      return null;
    case 'local':
    case 'uploaded':
      return draft.photo.uri;
    case 'stored':
      return storedUrl ?? null;
  }
}

/** The bucket refused the upload itself (e.g. an expired URL). */
export class BucketUploadError extends Error {
  constructor(readonly status: number) {
    super(`photo upload failed: ${status}`);
  }
}

/** What went wrong with a photo, for a translated message. */
export type PhotoProblem = PhotoError | 'upload_failed';

const apiProblems: readonly PhotoError[] = [
  'photo_too_large',
  'photo_upload_invalid',
  'too_many_photos_for_entry',
  'daily_photo_limit',
  'storage_unavailable',
];

export function photoProblem(error: unknown): PhotoProblem {
  if (error instanceof DetailedError) {
    const code = ((error.detail as { data?: unknown } | undefined)?.data as { error?: unknown } | undefined)?.error;
    if (apiProblems.includes(code as PhotoError)) return code as PhotoError;
  }
  return 'upload_failed';
}
