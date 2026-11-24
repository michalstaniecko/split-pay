import { createMiddleware } from 'hono/factory';
import type { Auth, Session, SessionUser } from '../auth';
import type { Db } from '../db/client';
import { isAccountBlocked } from '../routes/moderation';

/** Context variables set by `requireUser`. */
export type AuthEnv = { Variables: { user: SessionUser; session: Session; blocked: boolean } };

/**
 * Rejects requests without a valid session with 401 `{ error: 'unauthorized' }`.
 * On success, `c.get('user')` / `c.get('session')` are available in the handler.
 *
 * A blocked account (#27) can sign in, but its session is blocked (#48,
 * ADR-0019): it gets 403 `{ error: 'account_blocked' }` everywhere except
 * routes guarded with `allowBlocked` — reading `/me` and deleting the account.
 * Blocking is checked on every request, so unblocking restores normal access
 * on the next one. `c.get('blocked')` tells the handler.
 */
export const createRequireUser = (auth: Auth, db: Db, { allowBlocked = false }: { allowBlocked?: boolean } = {}) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!result) return c.json({ error: 'unauthorized' as const }, 401);
    const blocked = await isAccountBlocked(db, result.user.id);
    if (blocked && !allowBlocked) return c.json({ error: 'account_blocked' as const }, 403);
    c.set('user', result.user);
    c.set('session', result.session);
    c.set('blocked', blocked);
    await next();
  });
