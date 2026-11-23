import { createMiddleware } from 'hono/factory';
import type { Auth, Session, SessionUser } from '../auth';

/** Context variables set by `requireUser`. */
export type AuthEnv = { Variables: { user: SessionUser; session: Session } };

/**
 * Rejects requests without a valid session with 401 `{ error: 'unauthorized' }`.
 * On success, `c.get('user')` / `c.get('session')` are available in the handler.
 */
export const createRequireUser = (auth: Auth) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!result) return c.json({ error: 'unauthorized' as const }, 401);
    c.set('user', result.user);
    c.set('session', result.session);
    await next();
  });
