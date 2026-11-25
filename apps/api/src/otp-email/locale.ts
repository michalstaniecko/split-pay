import type { OtpLocale } from './message';

/**
 * The OTP email language from the request's `Accept-Language` (the app sends its
 * UI language). The user may not exist yet, so there is no stored preference.
 * Only the most preferred language counts: `pl` → Polish, anything else or no
 * header → English.
 */
export function otpLocaleFromHeader(header: string | null | undefined): OtpLocale {
  const preferred = (header ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.tag && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)[0];
  return preferred?.tag.split('-')[0] === 'pl' ? 'pl' : 'en';
}
