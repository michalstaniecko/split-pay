import { describe, expect, it } from 'vitest';
import { downscaledSize, PHOTO_LIMITS, ReceiptUploadRequest, receiptRetentionCutoff, PhotoUploadRequest } from './photos';

describe('downscaledSize', () => {
  it('shrinks the longer side of a landscape photo to the maximum, keeping the aspect ratio', () => {
    expect(downscaledSize({ width: 4032, height: 3024 }, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('shrinks the longer side of a portrait photo', () => {
    expect(downscaledSize({ width: 3024, height: 4032 }, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('leaves a photo that already fits untouched', () => {
    expect(downscaledSize({ width: 800, height: 600 }, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('rounds the shorter side to whole pixels and never below one', () => {
    expect(downscaledSize({ width: 3000, height: 1000 }, 1600)).toEqual({ width: 1600, height: 533 });
    expect(downscaledSize({ width: 10000, height: 1 }, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('PhotoUploadRequest', () => {
  it('accepts a JPEG within the size limit', () => {
    expect(PhotoUploadRequest.parse({ contentType: 'image/jpeg', size: 400_000 })).toEqual({
      contentType: 'image/jpeg',
      size: 400_000,
    });
  });

  it('rejects other formats (the phone always re-encodes to JPEG, which drops EXIF)', () => {
    expect(PhotoUploadRequest.safeParse({ contentType: 'image/png', size: 400_000 }).success).toBe(false);
  });

  it('rejects empty files but leaves the size limit to the API (it answers with a translated error code)', () => {
    expect(PhotoUploadRequest.safeParse({ contentType: 'image/jpeg', size: 0 }).success).toBe(false);
    expect(PhotoUploadRequest.safeParse({ contentType: 'image/jpeg', size: PHOTO_LIMITS.maxBytes + 1 }).success).toBe(
      true,
    );
  });
});

describe('ReceiptUploadRequest', () => {
  it('names the entry the receipt is for', () => {
    const entryId = '00000000-0000-4000-8000-000000000001';
    expect(ReceiptUploadRequest.parse({ entryId, contentType: 'image/jpeg', size: 1 })).toEqual({
      entryId,
      contentType: 'image/jpeg',
      size: 1,
    });
    expect(ReceiptUploadRequest.safeParse({ contentType: 'image/jpeg', size: 1 }).success).toBe(false);
  });
});

describe('receiptRetentionCutoff', () => {
  it('is one year (365 days) before now: groups archived earlier lose their receipt photos', () => {
    expect(receiptRetentionCutoff(new Date('2027-08-01T03:00:00.000Z')).toISOString()).toBe(
      '2026-08-01T03:00:00.000Z',
    );
  });
});
