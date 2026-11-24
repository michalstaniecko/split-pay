/**
 * What a blocked session may still do — the one place this policy lives.
 * A blocked account (#27) can sign in, but only to delete itself (#48,
 * ADR-0019): everything else answers 403 `account_blocked`. Blocking is
 * checked on every request, so unblocking restores normal access on the next one.
 */

/** Better Auth endpoints (relative to `/api/auth`): signing in, reading the session, signing out. */
const authPaths = new Set(['/email-otp/send-verification-otp', '/sign-in/email-otp', '/get-session', '/sign-out']);

/** API routes: who am I (`blocked: true` → "Konto zablokowane"), and account deletion. */
const apiRoutes = new Set(['GET /me', 'DELETE /me']);

/** May a blocked session call this Better Auth endpoint? Checked by the auth `before` hook. */
export const blockedSessionMayUseAuth = (path: string): boolean => authPaths.has(path);

/** May a blocked session call this API route? Checked by `requireUser`. */
export const blockedSessionMayUse = (method: string, path: string): boolean => apiRoutes.has(`${method} ${path}`);
