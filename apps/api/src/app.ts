import { defaultFeatureFlags, type FeatureFlags } from '@split-pay/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Auth } from './auth';
import type { Db } from './db/client';
import { type AuthEnv, createRequireUser } from './middleware/require-user';
import { linksRoutes } from './routes/group-links';
import { groupsRoutes } from './routes/groups';
import { myPayoutDetailsRoutes } from './routes/payout-details';
import { quickBillsRoutes } from './routes/quick-bills';

export interface AppDeps {
  auth: Auth;
  db: Db;
  /** Feature flags served to the apps; defaults (all off) when omitted. */
  flags?: FeatureFlags;
}

/**
 * Builds the HTTP app. IO (env, pools, OTP delivery) is injected so tests can
 * run it against the test database with a capturing OTP sender.
 * Keep routes chained in one expression (or `.route()` chained sub-apps) —
 * the typed client (`hc`) infers its types from this chain.
 */
export const createApp = ({ auth, db, flags = defaultFeatureFlags }: AppDeps) => {
  const requireUser = createRequireUser(auth);

  return (
    new Hono<AuthEnv>()
      .use(logger())
      .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
      .get('/health', (c) => c.json({ status: 'ok' as const }))
      /** Feature flags. Public: the app reads them before and without signing in. */
      .get('/flags', (c) => c.json<FeatureFlags>({ ...flags }))
      /** The signed-in user. */
      .get('/me', requireUser, (c) => {
        const user = c.get('user');
        return c.json({ id: user.id, email: user.email, name: user.name });
      })
      /** My payout details (Profile). */
      .route('/me/payout-details', myPayoutDetailsRoutes({ db, requireUser }))
      .route('/groups', groupsRoutes({ db, requireUser }))
      /** Quick bill: group + members without an account + its expense in one step. */
      .route('/quick-bills', quickBillsRoutes({ db, requireUser }))
      /** Opening a group link in the app: preview + join. */
      .route('/links', linksRoutes({ db, requireUser }))
  );
};

export type AppType = ReturnType<typeof createApp>;
