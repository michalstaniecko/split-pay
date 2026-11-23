import { zValidator } from '@hono/zod-validator';
import { AccountDeletion, defaultFeatureFlags, type FeatureFlags } from '@split-pay/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Auth } from './auth';
import type { Db } from './db/client';
import { type AuthEnv, createRequireUser } from './middleware/require-user';
import { deleteAccount } from './routes/account';
import { linksRoutes } from './routes/group-links';
import { groupsRoutes } from './routes/groups';
import { myPayoutDetailsRoutes } from './routes/payout-details';
import { myAvatarRoutes } from './routes/photos';
import { quickBillsRoutes } from './routes/quick-bills';
import { ratesRoutes } from './routes/rates';
import type { ObjectStorage } from './storage/object-storage';

export interface AppDeps {
  auth: Auth;
  db: Db;
  /** Feature flags served to the apps; defaults (all off) when omitted. */
  flags?: FeatureFlags;
  /** Photo bucket (ADR-0006); photo routes answer 503 when omitted. */
  storage?: ObjectStorage;
}

/**
 * Builds the HTTP app. IO (env, pools, OTP delivery) is injected so tests can
 * run it against the test database with a capturing OTP sender.
 * Keep routes chained in one expression (or `.route()` chained sub-apps) —
 * the typed client (`hc`) infers its types from this chain.
 */
export const createApp = ({ auth, db, flags = defaultFeatureFlags, storage }: AppDeps) => {
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
      /** Account deletion (ADR-0010): personal data goes, the user's members stay without an account. */
      .delete('/me', requireUser, zValidator('json', AccountDeletion), async (c) => {
        await deleteAccount(db, c.get('user'), c.req.valid('json').locale, storage);
        return c.json({ deleted: true as const });
      })
      /** My payout details (Profile). */
      .route('/me/payout-details', myPayoutDetailsRoutes({ db, requireUser }))
      /** My avatar (Profile): upload, set, remove. */
      .route('/me/avatar', myAvatarRoutes({ db, requireUser, storage }))
      .route('/groups', groupsRoutes({ db, requireUser, storage }))
      /** Quick bill: group + members without an account + its expense in one step. */
      .route('/quick-bills', quickBillsRoutes({ db, requireUser }))
      /** Opening a group link in the app: preview + join. */
      .route('/links', linksRoutes({ db, requireUser }))
      /** ECB exchange rates for a date (ADR-0014). */
      .route('/rates', ratesRoutes({ db, requireUser }))
  );
};

export type AppType = ReturnType<typeof createApp>;
