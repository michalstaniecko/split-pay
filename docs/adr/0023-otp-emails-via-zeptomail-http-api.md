# OTP emails via Zoho ZeptoMail's HTTP API

Sign-in codes (email OTP, no passwords) are delivered by **Zoho ZeptoMail**, EU data centre, through its **HTTP Send Mail API** (`POST /v1.1/email`, `Authorization: Zoho-enczapikey <token>`) called with plain `fetch`. The sender (`zeptoMailOtpSender`) implements the `OtpSender` port (`apps/api/src/otp-email/message.ts`), which `apps/api/src/auth.ts` uses. Without `ZEPTOMAIL_TOKEN` the API keeps the development sender, which writes codes to the log.

The SPEC originally asked for "transactional SMTP with a free plan". The product owner already has a ZeptoMail account with purchased credits, so the free-plan criterion no longer applies. ZeptoMail is built for transactional mail only, has an EU data centre, and is billed per email with no monthly fee, which suits the low volume of sign-in codes.

Emails are written in Polish or English. The user may not exist yet when a code is requested, so the language comes from the request: the app sends its UI language in `Accept-Language`, and anything other than Polish gets English. Templates are code (`apps/api/src/otp-email/templates.ts`): minimal inline HTML plus a plain-text part, the code in the subject so it shows in the notification.

## Considered Options

- **SMTP (ZeptoMail or any provider)**: rejected. It needs an extra dependency (`nodemailer`), and provider neutrality is already covered by the `OtpSender` port. An HTTP call is one `fetch`, like the Expo push sender.
- **Resend**: rejected. A free plan was the reason to consider it, and that no longer matters; it would be a new account and a new processor for no gain.
- **Brevo**: rejected. Same reason as Resend; it is also a marketing platform first, and we only send transactional codes.
- **Amazon SES**: rejected. Cheap at scale, but needs an AWS account, leaving the sandbox and IAM setup for a handful of emails a day.

## Consequences

- Zoho (ZeptoMail) is a processor of email addresses for sign-in codes, data in the EU. The privacy policy lists it.
- The domain `kwitz.app` must be verified in ZeptoMail (SPF + DKIM), and the Mail Agent needs a bounce address (`docs/runbook.md`).
- Delivery stays fire-and-forget so response time does not reveal whether an address exists. Failures are logged and reported to Sentry (`job: otp-email`) without the email, the code, the token or the provider's response body.
- Changing the provider means a new `OtpSender` implementation and a different env variable; the auth flow and templates stay.
