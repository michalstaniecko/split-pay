import { describe, expect, it } from 'vitest';
import { errorReportingOptions } from './error-reporting-options';

describe('errorReportingOptions', () => {
  it('is off without EXPO_PUBLIC_SENTRY_DSN', () => {
    expect(errorReportingOptions({ dsn: undefined })).toBeNull();
    expect(errorReportingOptions({ dsn: '' })).toBeNull();
  });

  it('is on with a DSN and collects no personal data', () => {
    const options = errorReportingOptions({ dsn: 'https://key@o1.ingest.sentry.io/1', environment: 'staging' });

    expect(options).toMatchObject({
      dsn: 'https://key@o1.ingest.sentry.io/1',
      environment: 'staging',
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableCaptureFailedRequests: false,
    });
  });

  it('scrubs every event before it is sent', () => {
    const options = errorReportingOptions({ dsn: 'https://key@o1.ingest.sentry.io/1' });
    const event = {
      type: undefined,
      message: 'failed for ania@example.com',
      user: { id: 'user-1', email: 'ania@example.com' },
      request: { url: 'kwitz://g/secret-token?x=1', cookies: { session: 'secret-cookie' } },
    };

    const sent = options?.beforeSend?.(event, {});

    expect(JSON.stringify(sent)).not.toMatch(/ania@example\.com|secret-token|secret-cookie/);
    expect(sent).toMatchObject({ message: 'failed for [email]', user: { id: 'user-1' } });
  });
});
