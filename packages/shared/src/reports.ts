import { z } from 'zod';
import { Id } from './model';

/**
 * Content reporting (DSA, SPEC "Photos"): anyone who can see a receipt photo
 * or an avatar can report it with a reason; an admin reviews open reports,
 * removes the photo or dismisses the report, and can block the account.
 */
export const REPORT_REASONS = ['illegal', 'sexual', 'violence', 'harassment', 'privacy', 'spam', 'other'] as const;
export const ReportReason = z.enum(REPORT_REASONS);
export type ReportReason = z.infer<typeof ReportReason>;

export const REPORT_DETAILS_MAX_LENGTH = 1000;

/** `POST /reports`: report a photo. `details` is free text, optional. */
export const PhotoReportRequest = z.object({
  photoId: Id,
  reason: ReportReason,
  details: z.string().trim().max(REPORT_DETAILS_MAX_LENGTH).default(''),
});
export type PhotoReportRequest = z.infer<typeof PhotoReportRequest>;

/** How an admin closed a report. */
export type ReportResolution = 'removed' | 'dismissed';

/** Better Auth error code when a blocked account tries to sign in (403). */
export const ACCOUNT_BLOCKED = 'ACCOUNT_BLOCKED';

/** `POST /admin/users/:userId/block`: an internal note on why. */
export const AccountBlockRequest = z.object({
  reason: z.string().trim().max(REPORT_DETAILS_MAX_LENGTH).default(''),
});
export type AccountBlockRequest = z.infer<typeof AccountBlockRequest>;
