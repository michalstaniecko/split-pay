import { describe, expect, it } from 'vitest';
import { PhotoReportRequest, REPORT_DETAILS_MAX_LENGTH } from './reports';

describe('PhotoReportRequest', () => {
  const photoId = '00000000-0000-4000-8000-000000000001';

  it('takes a photo, a reason and optional details (trimmed)', () => {
    expect(PhotoReportRequest.parse({ photoId, reason: 'sexual' })).toEqual({ photoId, reason: 'sexual', details: '' });
    expect(PhotoReportRequest.parse({ photoId, reason: 'other', details: '  spam link  ' })).toEqual({
      photoId,
      reason: 'other',
      details: 'spam link',
    });
  });

  it('rejects unknown reasons, missing photo ids and overlong details', () => {
    expect(PhotoReportRequest.safeParse({ photoId, reason: 'ugly' }).success).toBe(false);
    expect(PhotoReportRequest.safeParse({ reason: 'spam' }).success).toBe(false);
    expect(
      PhotoReportRequest.safeParse({ photoId, reason: 'other', details: 'x'.repeat(REPORT_DETAILS_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });
});
