/** What the auth flow hands to an `OtpSender`. Kept apart from `auth.ts` so senders don't import Better Auth. */

export type OtpType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

/** Languages the OTP email is written in. Anything else gets English. */
export type OtpLocale = 'pl' | 'en';

/** How long a one-time code is valid. The email states it, so it is derived from here. */
export const OTP_EXPIRES_IN_SECONDS = 300;

export interface OtpMessage {
  email: string;
  otp: string;
  type: OtpType;
  /** Email language, from the request's `Accept-Language` (the app's UI language). */
  locale: OtpLocale;
}

/** Delivers one-time sign-in codes: ZeptoMail in production (ADR-0023), the log in development. */
export interface OtpSender {
  send(message: OtpMessage): Promise<void>;
}
