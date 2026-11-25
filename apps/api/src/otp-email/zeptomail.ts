import { OTP_EXPIRES_IN_SECONDS, type OtpSender } from '../auth';
import { otpEmail } from './templates';

/**
 * OTP emails through Zoho ZeptoMail's Send Mail API (ADR-0023), EU data centre.
 * Plain `fetch`, no SDK; the `OtpSender` port keeps the provider swappable.
 */

export const DEFAULT_ZEPTOMAIL_API_URL = 'https://api.zeptomail.eu';
export const DEFAULT_EMAIL_FROM = 'Kwitz <no-reply@kwitz.app>';

const TOKEN_SCHEME = 'Zoho-enczapikey';

export interface EmailAddress {
  address: string;
  name?: string;
}

/** `Name <address>` or a bare `address`, as in `EMAIL_FROM`. Throws on anything else. */
export function parseEmailFrom(value: string): EmailAddress {
  const trimmed = value.trim();
  const named = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(trimmed);
  if (named) {
    const name = named[1]!.trim().replace(/^"(.*)"$/, '$1');
    return name ? { name, address: named[2]! } : { address: named[2]! };
  }
  if (/^[^<>\s]+@[^<>\s]+$/.test(trimmed)) return { address: trimmed };
  throw new Error('EMAIL_FROM must be "Name <address>" or an address');
}

export function zeptoMailOtpSender(options: {
  /** Send Mail token of the Mail Agent (with or without the `Zoho-enczapikey` prefix). */
  token: string;
  /** Base URL; default `https://api.zeptomail.eu`. */
  apiUrl?: string | undefined;
  /** Default `Kwitz <no-reply@kwitz.app>`. */
  from?: string | undefined;
  fetch?: typeof fetch;
}): OtpSender {
  const doFetch = options.fetch ?? fetch;
  const url = `${(options.apiUrl ?? DEFAULT_ZEPTOMAIL_API_URL).replace(/\/+$/, '')}/v1.1/email`;
  const from = parseEmailFrom(options.from ?? DEFAULT_EMAIL_FROM);
  const token = options.token.trim().replace(new RegExp(`^${TOKEN_SCHEME}\\s+`, 'i'), '');
  const validForMinutes = Math.round(OTP_EXPIRES_IN_SECONDS / 60);

  return {
    async send({ email, otp, type, locale }) {
      const content = otpEmail({ type, otp, locale, validForMinutes });
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: `${TOKEN_SCHEME} ${token}`,
          },
          body: JSON.stringify({
            from,
            to: [{ email_address: { address: email } }],
            subject: content.subject,
            htmlbody: content.html,
            textbody: content.text,
          }),
        });
      } catch (cause) {
        throw new Error('ZeptoMail request failed', { cause });
      }
      // Only the status: error bodies can echo the recipient back.
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`ZeptoMail responded ${res.status}`);
      }
    },
  };
}
