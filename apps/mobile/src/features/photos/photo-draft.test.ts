import { DetailedError } from 'hono/client';
import { describe, expect, it } from 'vitest';
import {
  BucketUploadError,
  photoProblem,
  receiptDraftFromEntry,
  receiptPhotoIdToSave,
  receiptPreviewUri,
  withUploadedReceipt,
} from './photo-draft';

const photo = { uri: 'file:///cache/receipt.jpg', size: 400_000, width: 1200, height: 1600 };
const apiError = (statusCode: number, data: unknown) =>
  new DetailedError(`${statusCode}`, { statusCode, detail: { data, statusText: '' } });

describe('receipt draft', () => {
  it('starts from the receipt an edited entry already has', () => {
    expect(receiptDraftFromEntry({ receiptPhotoId: 'p1' })).toEqual({ kind: 'stored', photoId: 'p1' });
    expect(receiptDraftFromEntry({ receiptPhotoId: null })).toEqual({ kind: 'none' });
    expect(receiptDraftFromEntry(undefined)).toEqual({ kind: 'none' });
  });

  it('a new photo has to be uploaded before the entry can point at it', () => {
    expect(receiptPhotoIdToSave({ kind: 'local', photo })).toBeUndefined();
    expect(receiptPhotoIdToSave({ kind: 'none' })).toBeNull();
    expect(receiptPhotoIdToSave({ kind: 'stored', photoId: 'p1' })).toBe('p1');
  });

  it('remembers an upload, so a retried save does not upload the photo again', () => {
    const uploaded = withUploadedReceipt({ kind: 'local', photo }, 'p2');
    expect(receiptPhotoIdToSave(uploaded)).toBe('p2');
    expect(receiptPreviewUri(uploaded, undefined)).toBe(photo.uri);
  });

  it('previews a local photo from the device and a stored one from its signed URL', () => {
    expect(receiptPreviewUri({ kind: 'local', photo }, undefined)).toBe(photo.uri);
    expect(receiptPreviewUri({ kind: 'stored', photoId: 'p1' }, 'https://bucket/p1')).toBe('https://bucket/p1');
    expect(receiptPreviewUri({ kind: 'stored', photoId: 'p1' }, undefined)).toBeNull();
    expect(receiptPreviewUri({ kind: 'none' }, 'https://bucket/p1')).toBeNull();
  });
});

describe('photoProblem', () => {
  it('reads the limit the API refused with', () => {
    expect(photoProblem(apiError(413, { error: 'photo_too_large', limit: 3_145_728 }))).toBe('photo_too_large');
    expect(photoProblem(apiError(429, { error: 'too_many_photos_for_entry', limit: 5 }))).toBe(
      'too_many_photos_for_entry',
    );
    expect(photoProblem(apiError(429, { error: 'daily_photo_limit', limit: 50 }))).toBe('daily_photo_limit');
    expect(photoProblem(apiError(503, { error: 'storage_unavailable' }))).toBe('storage_unavailable');
  });

  it('reads an uploaded file the API refused after checking it (deleted — upload again)', () => {
    expect(photoProblem(apiError(422, { error: 'photo_too_large', limit: 3_145_728 }))).toBe('photo_too_large');
    expect(photoProblem(apiError(422, { error: 'photo_upload_invalid' }))).toBe('photo_upload_invalid');
  });

  it('anything else is a failed upload', () => {
    expect(photoProblem(new BucketUploadError(403))).toBe('upload_failed');
    expect(photoProblem(new TypeError('Network request failed'))).toBe('upload_failed');
    expect(photoProblem(apiError(500, {}))).toBe('upload_failed');
  });
});
