import { expo } from '@better-auth/expo';
import { ACCOUNT_BLOCKED } from '@split-pay/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins';
import type { Db } from './db/client';
import * as authSchema from './db/auth-schema';
import { blockedSessionMayUseAuth } from './blocked-session';
import { isAccountBlocked } from './routes/moderation';

export type OtpType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

/** Delivers one-time sign-in codes. Production SMTP delivery comes with #32. */
export interface OtpSender {
  send(message: { email: string; otp: string; type: OtpType }): Promise<void>;
}

/** Development sender: writes the code to the API log. */
export const devOtpSender: OtpSender = {
  async send({ email, otp, type }) {
    console.log(`[otp] ${type} code for ${email}: ${otp}`);
  },
};

export interface AuthDeps {
  db: Db;
  otpSender: OtpSender;
  /** Public origin of the API (BETTER_AUTH_URL). */
  baseURL: string;
  /** BETTER_AUTH_SECRET, 32+ characters. */
  secret: string;
  trustedOrigins?: string[];
}

/** Better Auth with email OTP only — no passwords (SPEC: Auth). */
export const createAuth = (deps: AuthDeps) =>
  betterAuth({
    baseURL: deps.baseURL,
    secret: deps.secret,
    basePath: '/api/auth',
    database: drizzleAdapter(deps.db, { provider: 'pg', schema: authSchema }),
    // Member.userId is a UUID in the shared model.
    advanced: {
      database: { generateId: 'uuid' },
      // Better Auth turns origin checks off when NODE_ENV=test; keep them on so
      // API tests see production behaviour.
      disableOriginCheck: false,
    },
    // A blocked session reaches only what `blocked-session.ts` allows (#48,
    // ADR-0019). Sign-in itself has no session yet, so it passes. The API
    // routes check blocking in `requireUser`.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (blockedSessionMayUseAuth(ctx.path)) return;
        const current = await getSessionFromCtx(ctx);
        if (current && (await isAccountBlocked(deps.db, current.user.id))) {
          throw APIError.from('FORBIDDEN', { code: ACCOUNT_BLOCKED, message: 'This account is blocked.' });
        }
      }),
    },
    // `kwitz://` is the app scheme (app.json); expo() adds exp:// in development.
    trustedOrigins: ['kwitz://', ...(deps.trustedOrigins ?? [])],
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        async sendVerificationOTP({ email, otp, type }) {
          // Not awaited on purpose: response time must not reveal delivery (Better Auth docs).
          void deps.otpSender.send({ email, otp, type }).catch((error: unknown) => {
            console.error('[otp] delivery failed', error);
          });
        },
      }),
      expo(),
    ],
  });

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth['$Infer']['Session']['user'];
export type Session = Auth['$Infer']['Session']['session'];
