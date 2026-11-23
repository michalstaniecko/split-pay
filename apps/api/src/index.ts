import { serve } from '@hono/node-server';
import { parseFeatureFlagsJson } from '@split-pay/shared';
import { createApp } from './app';
import { createAuth, devOtpSender } from './auth';
import { createDb } from './db/client';

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
// WEB_URL: origin of the web app (e.g. https://app.example.com), used by link previews (/og/:token).
const app = createApp({ auth, db, flags, webUrl: process.env.WEB_URL || undefined });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
