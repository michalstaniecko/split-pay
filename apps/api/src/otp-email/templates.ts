import type { OtpType } from '../auth';

/** Languages the OTP email is written in. Anything else gets English. */
export type OtpLocale = 'pl' | 'en';

export interface OtpEmailContent {
  subject: string;
  html: string;
  text: string;
}

interface Copy {
  subject: Record<OtpType, (otp: string) => string>;
  intro: string;
  validity: (minutes: number) => string;
  notYou: string;
}

const copy: Record<OtpLocale, Copy> = {
  en: {
    subject: {
      'sign-in': (otp) => `Your Kwitz sign-in code: ${otp}`,
      'email-verification': (otp) => `Your Kwitz verification code: ${otp}`,
      'forget-password': (otp) => `Your Kwitz account recovery code: ${otp}`,
      'change-email': (otp) => `Your Kwitz email change code: ${otp}`,
    },
    intro: 'Enter this code in the Kwitz app:',
    validity: (minutes) => `The code is valid for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
    notYou: "If this wasn't you, ignore this email.",
  },
  pl: {
    subject: {
      'sign-in': (otp) => `Twój kod logowania do Kwitz: ${otp}`,
      'email-verification': (otp) => `Twój kod weryfikacyjny Kwitz: ${otp}`,
      'forget-password': (otp) => `Twój kod odzyskiwania konta Kwitz: ${otp}`,
      'change-email': (otp) => `Twój kod zmiany adresu e-mail w Kwitz: ${otp}`,
    },
    intro: 'Wpisz ten kod w aplikacji Kwitz:',
    validity: (minutes) => `Kod jest ważny przez ${minutes} ${polishMinutes(minutes)}.`,
    notYou: 'Jeśli to nie Ty, zignoruj tę wiadomość.',
  },
};

/** "minutę" / "minuty" / "minut" — Polish plural of the accusative "minuta". */
function polishMinutes(n: number): string {
  if (n === 1) return 'minutę';
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'minuty';
  return 'minut';
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * The OTP email: subject with the code (visible in the notification), a minimal
 * inline-styled HTML body and a plain-text alternative.
 */
export function otpEmail(input: {
  type: OtpType;
  otp: string;
  locale: OtpLocale;
  validForMinutes: number;
}): OtpEmailContent {
  const c = copy[input.locale];
  const subject = c.subject[input.type](input.otp);
  const validity = c.validity(input.validForMinutes);
  const text = `${c.intro}\n\n${input.otp}\n\n${validity}\n\n${c.notYou}\n`;
  const html = `<!doctype html>
<html lang="${input.locale}">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family:sans-serif;line-height:1.5">
<p>${escapeHtml(c.intro)}</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:4px">${escapeHtml(input.otp)}</p>
<p>${escapeHtml(validity)}</p>
<p>${escapeHtml(c.notYou)}</p>
</body>
</html>
`;
  return { subject, html, text };
}
