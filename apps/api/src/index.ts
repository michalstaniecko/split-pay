import { serve } from '@hono/node-server';
import { parseFeatureFlagsJson } from '@split-pay/shared';
import { createApp } from './app';
import { createAuth, devOtpSender } from './auth';
import { createDb } from './db/client';
import { parseAdminEmails } from './middleware/require-admin';
import { startPushJob } from './push/dispatch';
import { expoPushSender, logPushSender } from './push/sender';
import { frankfurterRateSource } from './rates/source';
import { startRateJob } from './rates/sync';
import { startPhotoRetentionJob } from './storage/retention';
import { s3StorageFromEnv } from './storage/s3';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see apps/api/.env.example)`);
  return value;
};

const port = Number(process.env.PORT ?? 3000);
const { db } = createDb(requireEnv('DATABASE_URL'));
const auth = createAuth({
  db,
  // TODO(#32): SMTP sender once a provider is chosen; until then codes go to the log.
  otpSender: devOtpSender,
  baseURL: requireEnv('BETTER_AUTH_URL'),
  secret: requireEnv('BETTER_AUTH_SECRET'),
});
// FEATURE_FLAGS: JSON, e.g. {"ads":true}. Unknown or invalid flags fall back to off.
const flags = parseFeatureFlagsJson(process.env.FEATURE_FLAGS);
// Photo bucket (ADR-0006): S3_* variables; without them photo routes answer 503.
const storage = s3StorageFromEnv(process.env);
if (!storage) console.warn('[photos] S3_* not set: receipt photos and avatars are disabled');
// ADMIN_EMAILS: comma-separated emails of app-wide moderators (#27). They sign in with email OTP
// like everyone; no admin accounts or credentials. Unset = nobody can open the admin panel.
const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
// WEB_URL: origin of the web app (e.g. https://app.example.com), used by link previews (/og/:token).
const app = createApp({ auth, db, adminEmails, flags, webUrl: process.env.WEB_URL || undefined, ...(storage ? { storage } : {}) });
// Daily ECB rates (ADR-0014); FRANKFURTER_URL points at a self-hosted instance if set.
startRateJob({ db, source: frankfurterRateSource({ baseUrl: process.env.FRANKFURTER_URL || undefined }) });
// Push notifications (#24): PUSH_SENDER=expo sends through the Expo push service
// (EXPO_ACCESS_TOKEN only if enhanced push security is on); anything else logs them.
startPushJob({
  db,
  sender:
    process.env.PUSH_SENDER === 'expo'
      ? expoPushSender({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined })
      : logPushSender,
});

// Daily: receipts of groups archived over a year ago, orphans, abandoned uploads.
if (storage) startPhotoRetentionJob({ db, storage });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
