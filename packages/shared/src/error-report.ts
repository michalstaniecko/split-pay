/**
 * Error reports (Sentry) carry no personal data (#64). Both the API and the
 * app pass every event through `scrubErrorReport` (`beforeSend`) on top of
 * `sendDefaultPii: false`. The user, request, headers, breadcrumbs and
 * contexts go through allowlists: a field the scrubber does not know is dropped
 * rather than sent. `extra` is dropped entirely.
 *
 * Kept: error types and messages, stack frames (without local variables; source
 * lines scrubbed), the
 * request method, URLs without query strings and link tokens, harmless headers,
 * breadcrumb outlines (category, method, status, URLs), device/OS/app/runtime
 * contexts without the device name, and the user id. Every kept string has
 * emails replaced.
 */

/** The parts of an error event the scrubber reads. Structurally compatible with Sentry's `ErrorEvent`. */
export interface ErrorReport {
  event_id?: string;
  message?: string;
  logentry?: { message?: string; params?: unknown[] };
  transaction?: string;
  user?: { id?: string | number };
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
  };
  exception?: {
    values?: Array<{
      value?: string;
      stacktrace?: {
        frames?: Array<{
          vars?: Record<string, unknown>;
          context_line?: string;
          pre_context?: string[];
          post_context?: string[];
        }>;
      };
    }>;
  };
  breadcrumbs?: Array<{
    type?: string;
    category?: string;
    level?: string;
    message?: string;
    timestamp?: number;
    data?: Record<string, unknown>;
  }>;
  contexts?: Record<string, Record<string, unknown> | undefined>;
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

const EMAIL = /[^\s@<>"'`(),;:/[\]]+@[^\s@<>"'`(),;:/[\]]+\.[a-z]{2,}/gi;
const URL_IN_TEXT = /[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]+/gi;
/** Path segments that are secrets: group link tokens in the API (`/links`, `/public/links`, `/og`) and the app (`/g`). Route patterns (`/links/:token`) stay. */
const TOKEN_SEGMENT = /(^|\/)(links|og|g)\/(?![:[])[^/?#\s]+/g;

/** Request headers that are sent; everything else (authorization, cookie, forwarded IPs…) is dropped. */
const KEPT_HEADERS = new Set(['accept', 'content-length', 'content-type', 'user-agent']);
/** Breadcrumb data that is sent; everything else (arguments, bodies…) is dropped. */
const KEPT_BREADCRUMB_DATA = new Set(['method', 'status_code', 'url', 'from', 'to']);
/** SDK contexts that are sent; app-specific ones (e.g. state snapshots) are dropped. */
const KEPT_CONTEXTS = new Set(['app', 'culture', 'device', 'os', 'runtime', 'trace']);

/** A URL without its query string, fragment and link tokens. */
export function scrubUrl(url: string): string {
  const path = url.replace(/[?#].*$/s, '');
  return path.replace(TOKEN_SEGMENT, '$1$2/[token]').replace(EMAIL, '[email]');
}

/** Free text with URLs scrubbed and emails replaced. */
function scrubText(text: string): string {
  return text.replace(URL_IN_TEXT, (url) => scrubUrl(url)).replace(TOKEN_SEGMENT, '$1$2/[token]').replace(EMAIL, '[email]');
}

/** Every string inside replaced via `scrubText`; other primitives kept. */
function scrubDeep(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrubDeep(inner)]));
  }
  return value;
}

/** `source` without undefined values (keeps the scrubbed event free of empty keys). */
function defined<T>(source: { [K in keyof T]?: T[K] | undefined }): T {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as T;
}

function scrubRequest(request: NonNullable<ErrorReport['request']>): ErrorReport['request'] {
  const headers = request.headers
    ? Object.fromEntries(
        Object.entries(request.headers)
          .filter(([name]) => KEPT_HEADERS.has(name.toLowerCase()))
          .map(([name, value]) => [name, scrubText(String(value))]),
      )
    : undefined;
  return defined<NonNullable<ErrorReport['request']>>({
    method: request.method,
    url: request.url === undefined ? undefined : scrubUrl(request.url),
    headers,
  });
}

function scrubBreadcrumb(crumb: NonNullable<ErrorReport['breadcrumbs']>[number]) {
  const data = crumb.data
    ? Object.fromEntries(
        Object.entries(crumb.data)
          .filter(([key]) => KEPT_BREADCRUMB_DATA.has(key))
          .map(([key, value]) => [key, typeof value === 'string' ? scrubUrl(value) : value]),
      )
    : undefined;
  return defined({
    type: crumb.type,
    category: crumb.category,
    level: crumb.level,
    timestamp: crumb.timestamp,
    data: data && Object.keys(data).length > 0 ? data : undefined,
  });
}

type Frame = NonNullable<NonNullable<NonNullable<ErrorReport['exception']>['values']>[number]['stacktrace']>['frames'];

/** A stack frame without local variables; source lines around it have emails replaced. */
function scrubFrame<F extends NonNullable<Frame>[number]>({ vars: _vars, ...frame }: F): F {
  return defined<F>({
    ...(frame as Partial<F>),
    context_line: frame.context_line === undefined ? undefined : scrubText(frame.context_line),
    pre_context: frame.pre_context?.map(scrubText),
    post_context: frame.post_context?.map(scrubText),
  } as { [K in keyof F]?: F[K] | undefined });
}

function scrubContexts(contexts: NonNullable<ErrorReport['contexts']>): ErrorReport['contexts'] {
  const kept: NonNullable<ErrorReport['contexts']> = {};
  for (const [name, context] of Object.entries(contexts)) {
    if (!KEPT_CONTEXTS.has(name) || !context) continue;
    // The device name is often the owner's name ("Ania's iPhone").
    const { name: _deviceName, ...withoutName } = context;
    kept[name] = scrubDeep(name === 'device' ? withoutName : context) as Record<string, unknown>;
  }
  return kept;
}

/**
 * A copy of `event` that is safe to send to Sentry: no request bodies, cookies,
 * auth headers, query strings, link tokens, emails, names or IP addresses.
 * Only the user id survives. Use as `beforeSend`.
 */
export function scrubErrorReport<T extends ErrorReport>(event: T): T {
  const { extra: _extra, user, request, exception, breadcrumbs, contexts, tags, message, logentry, transaction, ...rest } =
    event;
  return defined<T>({
    ...(rest as Partial<T>),
    message: message === undefined ? undefined : scrubText(message),
    logentry: logentry === undefined ? undefined : (scrubDeep(logentry) as ErrorReport['logentry']),
    transaction: transaction === undefined ? undefined : scrubText(transaction),
    user: user?.id === undefined ? undefined : { id: user.id },
    request: request ? scrubRequest(request) : undefined,
    exception: exception
      ? {
          ...exception,
          values: exception.values?.map((value) =>
            defined({
              ...value,
              value: value.value === undefined ? undefined : scrubText(value.value),
              stacktrace: value.stacktrace
                ? {
                    ...value.stacktrace,
                    frames: value.stacktrace.frames?.map(scrubFrame),
                  }
                : undefined,
            }),
          ),
        }
      : undefined,
    breadcrumbs: breadcrumbs?.map(scrubBreadcrumb),
    contexts: contexts ? scrubContexts(contexts) : undefined,
    tags: tags ? (scrubDeep(tags) as Record<string, unknown>) : undefined,
  } as { [K in keyof T]?: T[K] | undefined });
}
