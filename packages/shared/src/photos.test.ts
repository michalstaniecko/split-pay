import { describe, expect, it } from 'vitest';
import {
  downscaledSize,
  photoEditPlan,
  PHOTO_LIMITS,
  PhotoUploadRequest,
  ReceiptUploadRequest,
  receiptRetentionCutoff,
  uploadedPhotoProblem,
} from './photos';

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

describe('photoEditPlan', () => {
  it('crops a landscape photo to its largest centered square, then downscales it', () => {
    expect(photoEditPlan({ width: 4032, height: 3024 }, 512, { square: true })).toEqual({
      crop: { originX: 504, originY: 0, width: 3024, height: 3024 },
      resize: { width: 512, height: 512 },
    });
  });

  it('keeps the middle of a portrait photo', () => {
    expect(photoEditPlan({ width: 3024, height: 4032 }, 512, { square: true })).toEqual({
      crop: { originX: 0, originY: 504, width: 3024, height: 3024 },
      resize: { width: 512, height: 512 },
    });
  });

  it('only downscales a photo that is already square', () => {
    expect(photoEditPlan({ width: 2000, height: 2000 }, 512, { square: true })).toEqual({
      crop: { originX: 0, originY: 0, width: 2000, height: 2000 },
      resize: { width: 512, height: 512 },
    });
  });

  it('floors an odd offset so the crop stays whole pixels inside the photo', () => {
    expect(photoEditPlan({ width: 4033, height: 3024 }, 512, { square: true })).toEqual({
      crop: { originX: 504, originY: 0, width: 3024, height: 3024 },
      resize: { width: 512, height: 512 },
    });
    expect(photoEditPlan({ width: 3, height: 6 }, 512, { square: true }).crop).toEqual({
      originX: 0,
      originY: 1,
      width: 3,
      height: 3,
    });
  });

  it('handles extreme aspect ratios', () => {
    expect(photoEditPlan({ width: 10000, height: 1 }, 512, { square: true })).toEqual({
      crop: { originX: 4999, originY: 0, width: 1, height: 1 },
    });
  });

  it('crops a photo smaller than the maximum without upscaling it', () => {
    expect(photoEditPlan({ width: 400, height: 300 }, 512, { square: true })).toEqual({
      crop: { originX: 50, originY: 0, width: 300, height: 300 },
    });
  });

  it('without square, only downscales like downscaledSize (receipts)', () => {
    expect(photoEditPlan({ width: 4032, height: 3024 }, 1600, { square: false })).toEqual({
      resize: { width: 1600, height: 1200 },
    });
    expect(photoEditPlan({ width: 800, height: 600 }, 1600, { square: false })).toEqual({});
  });

  it('always plans a square avatar', () => {
    for (const size of [
      { width: 4032, height: 3024 },
      { width: 1080, height: 1920 },
      { width: 513, height: 7777 },
      { width: 99, height: 100 },
    ]) {
      const plan = photoEditPlan(size, 512, { square: true });
      const result = plan.resize ?? plan.crop;
      expect(result?.width).toBe(result?.height);
    }
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

describe('uploadedPhotoProblem', () => {
  it('accepts a JPEG within the size limit', () => {
    expect(uploadedPhotoProblem({ size: 400_000, contentType: 'image/jpeg' })).toBeNull();
    expect(uploadedPhotoProblem({ size: PHOTO_LIMITS.maxBytes, contentType: 'Image/JPEG; charset=binary' })).toBeNull();
  });

  it('refuses a file over the size limit', () => {
    expect(uploadedPhotoProblem({ size: PHOTO_LIMITS.maxBytes + 1, contentType: 'image/jpeg' })).toBe('too_large');
  });

  it('refuses a missing or empty object and anything but a JPEG', () => {
    expect(uploadedPhotoProblem(null)).toBe('invalid');
    expect(uploadedPhotoProblem({ size: 0, contentType: 'image/jpeg' })).toBe('invalid');
    expect(uploadedPhotoProblem({ size: 1000, contentType: 'image/png' })).toBe('invalid');
    expect(uploadedPhotoProblem({ size: 1000, contentType: null })).toBe('invalid');
  });
});
