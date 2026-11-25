import type { ReactNativeOptions } from '@sentry/react-native';
import { scrubErrorReport } from '@split-pay/shared';

/**
 * Sentry options for the app, or `null` when no DSN is set (Sentry off). No PII (#64):
 * `sendDefaultPii: false`, no screenshots or view hierarchy, no failed-request capture,
 * and every event goes through the shared scrubber. Only the user id is sent.
 * Kept free of the SDK itself so it can be tested without native modules.
 */
export function errorReportingOptions({
  dsn,
  environment,
}: {
  dsn: string | undefined;
  environment?: string | undefined;
}): ReactNativeOptions | null {
  if (!dsn) return null;
  return {
    dsn,
    ...(environment ? { environment } : {}),
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    enableCaptureFailedRequests: false,
    beforeSend: (event) => scrubErrorReport(event),
    // Console lines and touches can name people; the scrubber would empty them anyway.
    beforeBreadcrumb: (breadcrumb) =>
      breadcrumb.category === 'console' || breadcrumb.category === 'touch' ? null : breadcrumb,
  };
}
