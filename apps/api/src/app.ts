import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Auth } from './auth';
import type { Db } from './db/client';
import { type AuthEnv, createRequireUser } from './middleware/require-user';
import { groupsRoutes } from './routes/groups';

export interface AppDeps {
  auth: Auth;
  db: Db;
}

/**
 * Builds the HTTP app. IO (env, pools, OTP delivery) is injected so tests can
 * run it against the test database with a capturing OTP sender.
 * Keep routes chained in one expression (or `.route()` chained sub-apps) —
 * the typed client (`hc`) infers its types from this chain.
 */
export const createApp = ({ auth, db }: AppDeps) => {
  const requireUser = createRequireUser(auth);

  return (
    new Hono<AuthEnv>()
      .use(logger())
      .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
      .get('/health', (c) => c.json({ status: 'ok' as const }))
      /** The signed-in user. */
      .get('/me', requireUser, (c) => {
        const user = c.get('user');
        return c.json({ id: user.id, email: user.email, name: user.name });
      })
      .route('/groups', groupsRoutes({ db, requireUser }))
  );
};

export type AppType = ReturnType<typeof createApp>;
