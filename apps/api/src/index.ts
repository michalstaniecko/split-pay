import { serve } from '@hono/node-server';
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
const app = createApp({ auth, db });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
