import { createMiddleware } from 'hono/factory';
import type { Auth, Session, SessionUser } from '../auth';
import type { Db } from '../db/client';
import { blockedSessionMayUse } from '../blocked-session';
import { isAccountBlocked } from '../routes/moderation';

/** Context variables set by `requireUser`. */
export type AuthEnv = { Variables: { user: SessionUser; session: Session; blocked: boolean } };

/**
 * Rejects requests without a valid session with 401 `{ error: 'unauthorized' }`.
 * On success, `c.get('user')` / `c.get('session')` are available in the handler.
 *
 * A blocked session (#48, ADR-0019) gets 403 `{ error: 'account_blocked' }`
 * except on the routes `blocked-session.ts` allows; `c.get('blocked')` tells
 * the handler.
 */
export const createRequireUser = (auth: Auth, db: Db) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!result) return c.json({ error: 'unauthorized' as const }, 401);
    const blocked = await isAccountBlocked(db, result.user.id);
    if (blocked && !blockedSessionMayUse(c.req.method, c.req.path)) return c.json({ error: 'account_blocked' as const }, 403);
    c.set('user', result.user);
    c.set('session', result.session);
    c.set('blocked', blocked);
    await next();
  });
