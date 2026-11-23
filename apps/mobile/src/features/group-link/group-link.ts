import qrcode from 'qrcode-generator';

/** The app's custom URL scheme (`app.json` → `scheme`). */
const APP_SCHEME = 'splitpay';

/**
 * The shareable URL of a group link (ADR-0009). Until the domain is chosen
 * (SPEC open task) it uses the app's custom scheme; with a web base URL
 * (`EXPO_PUBLIC_WEB_URL`) it becomes `<base>/g/<token>`, ready for universal /
 * app links and the web preview. Both resolve to the `g/[token]` route.
 */
export function groupLinkUrl(token: string, webBaseUrl: string | undefined): string {
  const path = `g/${encodeURIComponent(token)}`;
  if (!webBaseUrl) return `${APP_SCHEME}://${path}`;
  return `${webBaseUrl.replace(/\/+$/, '')}/${path}`;
}

/**
 * The token of an incoming group link (`splitpay://g/<token>`,
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
 * When it arrives while signed out, the guard shows sign-in instead; once
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
