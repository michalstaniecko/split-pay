import { createMiddleware } from 'hono/factory';
import type { AuthEnv } from './require-user';

/**
 * Admins (#27) are app-wide moderators, not a group role (ADR-0008): signed-in
 * users whose email is on the `ADMIN_EMAILS` allowlist. No admin accounts or
 * credentials exist — an admin signs in with email OTP like everyone else.
 */
export const parseAdminEmails = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

export const isAdminEmail = (adminEmails: readonly string[], email: string) =>
  adminEmails.includes(email.trim().toLowerCase());

/** After `requireUser`: 403 `{ error: 'forbidden' }` unless the user is an admin. */
export const createRequireAdmin = (adminEmails: readonly string[]) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    if (!isAdminEmail(adminEmails, c.get('user').email)) return c.json({ error: 'forbidden' as const }, 403);
    await next();
  });
