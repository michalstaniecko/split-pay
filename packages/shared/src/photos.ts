import { z } from 'zod';
import { Id } from './model';

/**
 * Photos (SPEC "Photos", ADR-0006, ADR-0020): only a receipt photo on an
 * expense or income and a user avatar. The phone downscales, re-encodes to
 * JPEG (which drops EXIF, GPS included) and uploads straight to the private
 * bucket with a presigned PUT; the API issues upload and short-lived read
 * URLs, checks each uploaded object and enforces these limits.
 */
export const PHOTO_LIMITS = {
  /** Largest accepted file, bytes. A 1600 px JPEG is usually well under 1 MB. */
  maxBytes: 3 * 1024 * 1024,
  /** Receipt uploads per entry (retakes and replacements count). An entry shows one receipt. */
  maxUploadsPerEntry: 5,
  /** Uploads (receipts + avatars) per account in any 24 hours. */
  maxUploadsPerDay: 50,
} as const;

/** Longer side of a receipt photo after downscaling on the phone, px. */
export const RECEIPT_MAX_DIMENSION = 1600;
/** Longer side of an avatar after downscaling on the phone, px. */
export const AVATAR_MAX_DIMENSION = 512;
/** JPEG quality the phone compresses with (0–1). */
export const PHOTO_JPEG_QUALITY = 0.7;

/** Receipt photos are deleted this many days after their group was archived. */
export const RECEIPT_RETENTION_DAYS = 365;

/** Groups archived before this instant have their receipt photos deleted by the daily retention job. */
export function receiptRetentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** Only JPEG: the phone always re-encodes, so nothing else (and no original with EXIF) is uploaded. */
export const PhotoContentType = z.literal('image/jpeg');
export type PhotoContentType = z.infer<typeof PhotoContentType>;

/**
 * Asking for an upload URL. `size` is the file the phone is about to send;
 * the API answers `photo_too_large` above `PHOTO_LIMITS.maxBytes`. A PUT URL
 * can't limit the bytes, so the API checks the uploaded object again before
 * it is used (receipt: "complete upload"; avatar: setting it).
 */
export const PhotoUploadRequest = z.object({
  contentType: PhotoContentType,
  size: z.int().positive(),
});
export type PhotoUploadRequest = z.infer<typeof PhotoUploadRequest>;

/** Asking for a receipt upload URL: the entry (client-generated id, may not exist yet) it is for. */
export const ReceiptUploadRequest = PhotoUploadRequest.extend({ entryId: Id });
export type ReceiptUploadRequest = z.infer<typeof ReceiptUploadRequest>;

/** Setting the avatar to an uploaded photo. */
export const AvatarUpdate = z.object({ photoId: Id });
export type AvatarUpdate = z.infer<typeof AvatarUpdate>;

/**
 * Error codes of the photo routes; the app shows them translated.
 * `photo_upload_invalid`: the uploaded object is missing or not a JPEG — the
 * API deleted it, so the phone uploads the photo again.
 */
export type PhotoError =
  | 'photo_too_large'
  | 'photo_upload_invalid'
  | 'too_many_photos_for_entry'
  | 'daily_photo_limit'
  | 'storage_unavailable';

/** Whether an uploaded object may be used as a photo; `too_large` / `invalid` otherwise. */
export function uploadedPhotoProblem(object: { size: number; contentType: string | null } | null) {
  if (!object || object.size <= 0) return 'invalid' as const;
  if (object.size > PHOTO_LIMITS.maxBytes) return 'too_large' as const;
  const type = object.contentType?.split(';')[0]?.trim().toLowerCase();
  return type === 'image/jpeg' ? null : ('invalid' as const);
}

/** Downscales `size` so its longer side is at most `max`, keeping the aspect ratio. */
export function downscaledSize(size: { width: number; height: number }, max: number): { width: number; height: number } {
  const longer = Math.max(size.width, size.height);
  if (longer <= max) return { width: size.width, height: size.height };
  const scale = max / longer;
  const fit = (side: number) => (side === longer ? max : Math.max(1, Math.round(side * scale)));
  return { width: fit(size.width), height: fit(size.height) };
}
