import * as Sentry from '@sentry/node';
import { scrubErrorReport } from '@split-pay/shared';
import type { Context, ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

/** Where a failed request came from. Route pattern, not the path: paths carry link tokens. */
export interface ErrorContext {
  method: string;
  route: string;
  userId?: string;
}

/** Sends server errors somewhere (Sentry). */
export interface ErrorReporter {
  capture(error: unknown, context: ErrorContext): void;
  /** A failed run of a background job (`rates`, `push`, `photo-retention`) or OTP email delivery (`otp-email`). */
  captureJob(error: unknown, job: string): void;
}

/**
 * What the SDK may collect (Sentry v11 replaced `sendDefaultPii` with `dataCollection`,
 * whose defaults collect everything): no user info, cookies, bodies, query strings,
 * local variables or query data; only harmless request headers.
 */
const dataCollection: NonNullable<Sentry.NodeOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['accept', 'content-length', 'content-type', 'user-agent'] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
};

/**
 * Sentry options from the environment, or `null` when `SENTRY_DSN` is unset (Sentry off).
 * `SENTRY_ENVIRONMENT`: `staging` / `production`. No PII (#64): the SDK collects nothing
 * personal (`dataCollection`) and every event still goes through the shared scrubber.
 */
export function sentryOptionsFromEnv(env: Record<string, string | undefined>): Sentry.NodeOptions | null {
  if (!env.SENTRY_DSN) return null;
  return {
    dsn: env.SENTRY_DSN,
    ...(env.SENTRY_ENVIRONMENT ? { environment: env.SENTRY_ENVIRONMENT } : {}),
    dataCollection,
    beforeSend: (event) => scrubErrorReport(event),
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === 'console' ? null : breadcrumb),
  };
}

/**
 * Starts Sentry when `SENTRY_DSN` is set and returns a reporter for request errors;
 * `null` when off. Unhandled exceptions and rejections are captured by Sentry's
 * default integrations. `overrides` is for tests (e.g. a capturing transport).
 */
export function startSentry(
  env: Record<string, string | undefined>,
  overrides: Partial<Sentry.NodeOptions> = {},
): ErrorReporter | null {
  const options = sentryOptionsFromEnv(env);
  if (!options) return null;
  Sentry.init({ ...options, ...overrides });
  return {
    capture(error, { method, route, userId }) {
      Sentry.withScope((scope) => {
        scope.setTags({ method, route });
        if (userId) scope.setUser({ id: userId });
        Sentry.captureException(error);
      });
    },
    captureJob(error, job) {
      Sentry.withScope((scope) => {
        scope.setTag('job', job);
        Sentry.captureException(error);
      });
    },
  };
}

/**
 * Hono `onError`: reports unhandled errors and 5xx `HTTPException`s, then answers like
 * Hono's default handler (the exception's response, or a plain 500).
 */
export const reportServerErrors =
  (reporter: ErrorReporter | null | undefined): ErrorHandler =>
  (error, c: Context) => {
    const status = error instanceof HTTPException ? error.status : 500;
    if (status >= 500) {
      console.error(error);
      const user = c.get('user') as { id?: string } | undefined;
      reporter?.capture(error, {
        method: c.req.method,
        route: c.req.routePath,
        ...(user?.id ? { userId: user.id } : {}),
      });
    }
    return error instanceof HTTPException ? error.getResponse() : c.text('Internal Server Error', 500);
  };
