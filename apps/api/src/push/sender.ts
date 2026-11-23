/**
 * Push delivery. The Expo push service (APNs + FCM behind it) sits behind
 * `PushSender` so tests use a fake and development logs instead of sending.
 */

/** What the app reads from a notification (tap → Conversation at the entry; silent → sync). */
export interface PushData {
  type: 'notification' | 'sync';
  groupId: string;
  /** The entry to scroll to and highlight (newest of a burst); absent for deletions, claims, nudges. */
  entryId?: string;
}

/** One message to one device, in the Expo push format. */
export interface PushMessage {
  to: string;
  data: PushData;
  /** Absent for a silent push. */
  title?: string;
  body?: string;
  sound?: 'default';
  /** iOS: wake the app in the background (silent pushes and syncing on visible ones). */
  _contentAvailable?: boolean;
  priority?: 'default' | 'normal' | 'high';
}

/** Expo's per-message result ("push ticket"). */
export type PushTicket =
  | { status: 'ok'; id?: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

export interface PushSender {
  /** Sends the messages; returns one ticket per message, in order. */
  send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
}

/** Development sender: logs what would be sent. */
export const logPushSender: PushSender = {
  async send(messages) {
    for (const m of messages) {
      console.log(`[push] ${m.to} ${m.title ?? '(silent)'}: ${m.body ?? JSON.stringify(m.data)}`);
    }
    return messages.map(() => ({ status: 'ok' as const }));
  },
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const CHUNK = 100;

/**
 * Sends through the Expo push service. `accessToken` is only needed when
 * "enhanced push security" is on in the Expo project; APNs/FCM credentials
 * live in the Expo project, not here.
 */
export function expoPushSender(options: { accessToken?: string | undefined; fetch?: typeof fetch } = {}): PushSender {
  const doFetch = options.fetch ?? fetch;
  return {
    async send(messages) {
      const tickets: PushTicket[] = [];
      for (let i = 0; i < messages.length; i += CHUNK) {
        const chunk = messages.slice(i, i + CHUNK);
        const res = await doFetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
          },
          body: JSON.stringify(chunk),
        });
        if (!res.ok) throw new Error(`Expo push → ${res.status} ${await res.text()}`);
        const body = (await res.json()) as { data: PushTicket[] };
        tickets.push(...body.data);
      }
      return tickets;
    },
  };
}
