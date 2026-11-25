import { describe, expect, it } from 'vitest';
import type { OtpLocale } from './message';
import { zeptoMailOtpSenderFromEnv } from './zeptomail';

/**
 * The ZeptoMail sender against the real API (ADR-0023): sends one Polish and one
 * English sign-in email to `ZEPTOMAIL_LIVE_TO`. Skipped unless
 * `ZEPTOMAIL_LIVE_TEST=1`. Uses the usual `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_API_URL`
 * and `EMAIL_FROM` (on a domain verified in ZeptoMail). From `apps/api`, with
 * the variables in `.env`:
 *
 *   ZEPTOMAIL_LIVE_TEST=1 ZEPTOMAIL_LIVE_TO=you@example.com \
 *   node --env-file=.env ../../node_modules/vitest/vitest.mjs run src/otp-email/zeptomail.live.test.ts
 *
 * A pass means ZeptoMail accepted both emails; check the inbox for delivery,
 * the subject in the notification and the spam folder.
 */
const env = process.env;
const liveSender =
  env.ZEPTOMAIL_LIVE_TEST === '1' && env.ZEPTOMAIL_LIVE_TO ? zeptoMailOtpSenderFromEnv(env) : undefined;

describe.skipIf(!liveSender)('zeptoMailOtpSender against ZeptoMail', () => {
  const sender = liveSender!;

  it.each<OtpLocale>(['pl', 'en'])('sends a %s sign-in code', async (locale) => {
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    await expect(sender.send({ email: env.ZEPTOMAIL_LIVE_TO!, otp, type: 'sign-in', locale })).resolves.toBeUndefined();
  });
});
