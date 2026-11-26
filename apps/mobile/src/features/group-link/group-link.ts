import qrcode from 'qrcode-generator';

/** The app's custom URL scheme (`app.json` → `scheme`). */
const APP_SCHEME = 'kwitz';

/**
 * The shareable URL of a group link (ADR-0009): `<base>/g/<token>` with the web
 * base URL (`EXPO_PUBLIC_WEB_URL`), which opens the installed app (universal /
 * App Links) or else the web view. Without one (dev only, see `webUrlFrom` in
 * `app.config.ts`) it uses the app's custom scheme. Both resolve to the
 * `g/[token]` route.
 */
export function groupLinkUrl(token: string, webBaseUrl: string | undefined): string {
  const path = `g/${encodeURIComponent(token)}`;
  if (!webBaseUrl) return `${APP_SCHEME}://${path}`;
  return `${webBaseUrl.replace(/\/+$/, '')}/${path}`;
}

/**
 * Whether Group info offers sharing the group link (and its QR code) and
 * personal claim links. Not in an archived group: nobody can join it (409).
 */
export function canShareLinks(group: { archivedAt: string | null }): boolean {
  return group.archivedAt === null;
}

/**
 * The token of an incoming group link (`kwitz://g/<token>`,
 * `https://…/g/<token>` or the bare path `/g/<token>`); `undefined` for other links.
 */
export function joinTokenFromPath(path: string): string | undefined {
  const match = /(?:^|\/)g\/([^/?#]+)/.exec(path);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/** The QR code of `text` as rows of modules (`true` = dark), without the quiet zone. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

let pendingToken: string | undefined;

/**
 * The last group link the app was opened with (`src/app/+native-intent.tsx`).
 * When it arrives while signed out (also after "Kontynuuj bez konta"), the
 * group link route sends to sign-in and keeps it pending; once
 * signed in, the app takes it and opens the join screen. The join screen also
 * takes it, so a link opened while signed in isn't replayed later. In memory
 * only: lost if the app is killed before signing in.
 */
export const pendingJoin = {
  remember(token: string) {
    pendingToken = token;
  },
  take(): string | undefined {
    const token = pendingToken;
    pendingToken = undefined;
    return token;
  },
};
