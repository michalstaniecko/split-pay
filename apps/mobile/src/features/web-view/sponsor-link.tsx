/**
 * The GitHub Sponsors link lives only on the web and in the README, never in
 * the mobile app (ADR-0011) — see `sponsor-link.web.tsx`. Native: nothing,
 * and the URL isn't even in the native bundle.
 */
export function SponsorLink() {
  return null;
}
