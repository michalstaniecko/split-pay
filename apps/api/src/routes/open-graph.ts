import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { members } from '../db/schema';
import { resolveLinkToken } from './claims';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Language = 'pl' | 'en';

/** Crawlers asking for English get English; everyone else the source language (Polish). */
const languageOf = (acceptLanguage: string | undefined): Language =>
  acceptLanguage?.trim().toLowerCase().startsWith('en') ? 'en' : 'pl';

const copy = {
  pl: {
    description: (n: number) => {
      const form = new Intl.PluralRules('pl').select(n);
      const people = form === 'one' ? 'osoba' : form === 'few' ? 'osoby' : 'osób';
      return `Wydatki grupy w split-pay · ${n} ${people}`;
    },
    invalid: 'Ten link grupy jest już nieważny.',
  },
  en: {
    description: (n: number) => `Group expenses in split-pay · ${n} ${n === 1 ? 'member' : 'members'}`,
    invalid: 'This group link is no longer valid.',
  },
} satisfies Record<Language, unknown>;

function page(tags: { title: string; description: string; url?: string | undefined; lang: Language }): string {
  const meta = [
    `<meta property="og:title" content="${escapeHtml(tags.title)}">`,
    `<meta property="og:description" content="${escapeHtml(tags.description)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="split-pay">',
    '<meta name="twitter:card" content="summary">',
    ...(tags.url
      ? [
          `<meta property="og:url" content="${escapeHtml(tags.url)}">`,
          // A person (not a crawler) landing here goes on to the web view.
          `<meta http-equiv="refresh" content="0; url=${escapeHtml(tags.url)}">`,
        ]
      : []),
  ];
  return [
    '<!doctype html>',
    `<html lang="${tags.lang}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(tags.title)}</title>`,
    ...meta,
    '</head>',
    '<body>',
    tags.url ? `<a href="${escapeHtml(tags.url)}">${escapeHtml(tags.title)}</a>` : `<p>${escapeHtml(tags.description)}</p>`,
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * Link previews for messengers (SPEC "Web interface"), mounted at `/og`:
 * `GET /og/:token` → a tiny HTML page with Open Graph tags (group emoji +
 * name, member count) that redirects people to the web view
 * (`<webUrl>/g/<token>`). Crawlers of `<webUrl>/g/*` have to be routed here
 * by the web host. Unknown/revoked tokens → 404 with a generic preview.
 */
export const openGraphRoutes = ({ db, webUrl }: { db: Db; webUrl: string | undefined }) =>
  new Hono().get('/:token', async (c) => {
    const lang = languageOf(c.req.header('accept-language'));
    const token = c.req.param('token');
    const link = await resolveLinkToken(db, token);
    if (!link) return c.html(page({ title: 'split-pay', description: copy[lang].invalid, lang }), 404);
    const { group } = link;
    const [row] = await db.select({ n: count() }).from(members).where(eq(members.groupId, group.id));
    return c.html(
      page({
        title: `${group.emoji} ${group.name}`,
        description: copy[lang].description(row?.n ?? 0),
        url: webUrl ? `${webUrl.replace(/\/+$/, '')}/g/${encodeURIComponent(token)}` : undefined,
        lang,
      }),
      200,
    );
  });
