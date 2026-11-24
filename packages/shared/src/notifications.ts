import { z } from 'zod';
import { deletedUserName } from './account';
import { formatAmount } from './format';
import { type Entry, Id, type Member, referencedMemberIds } from './model';

/** A device's Expo push token, registered after sign-in (removed on sign-out). */
export const PushTokenRegistration = z.object({
  token: z.string().min(1).max(255),
  platform: z.enum(['ios', 'android']),
  /** UI language of the app on that device; notification texts use it. */
  locale: z.string().min(1).max(35),
});
export type PushTokenRegistration = z.infer<typeof PushTokenRegistration>;

export const PushTokenRemoval = z.object({ token: z.string().min(1).max(255) });
export type PushTokenRemoval = z.infer<typeof PushTokenRemoval>;

/** Notifications on/off — globally (Profile) or for one group (Group info → settings). */
export const NotificationSetting = z.strictObject({ enabled: z.boolean() });
export type NotificationSetting = z.infer<typeof NotificationSetting>;

/** "Przypomnij": nudge the member who owes me. */
export const NudgeRequest = z.object({ memberId: Id });
export type NudgeRequest = z.infer<typeof NudgeRequest>;

/** Something that happened in a group that members may hear about by push. */
export type NotificationEvent =
  | { type: 'entryCreated'; entry: Entry }
  | { type: 'entryEdited'; before: Entry; after: Entry }
  | { type: 'entryDeleted'; entry: Entry }
  /** A member without an account was claimed (ADR-0007). */
  | { type: 'claim'; memberId: Id }
  /** "Przypomnij": a manual reminder to the member who owes. */
  | { type: 'nudge'; toMemberId: Id };

/** Members an event is about, before dropping the author and members without an account. */
function concernedMemberIds(event: NotificationEvent, members: readonly Member[]): Id[] {
  switch (event.type) {
    case 'entryCreated':
      // A settlement is news only for the member it is in favour of.
      return event.entry.kind === 'settlement' ? [event.entry.to] : [...referencedMemberIds(event.entry)];
    case 'entryEdited':
      return [...referencedMemberIds(event.before), ...referencedMemberIds(event.after)];
    case 'entryDeleted':
      return [...referencedMemberIds(event.entry)];
    case 'claim':
      return members.map((m) => m.id);
    case 'nudge':
      return [event.toMemberId];
  }
}

/**
 * Users to notify about an event (SPEC "Notifications"): the members taking
 * part in it (an entry's payers or recipients and its split; a settlement's
 * sides; everyone for a claim; the debtor for a nudge) who have an account,
 * never the author. Unique user ids, in the order the members first appear.
 */
export function notificationRecipients(event: NotificationEvent, members: readonly Member[], actorUserId: Id): Id[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const users = new Set<Id>();
  for (const id of concernedMemberIds(event, members)) {
    const userId = byId.get(id)?.userId;
    if (userId && userId !== actorUserId) users.add(userId);
  }
  return [...users];
}

/**
 * What a queued push is about. `sync` is a silent push (no text) that only
 * makes the app refresh the group — sent to members who get no visible
 * notification for a change.
 */
export type PushKind = 'entryCreated' | 'entryEdited' | 'entryDeleted' | 'claim' | 'nudge' | 'sync';

/** A push waiting to be sent, as far as grouping is concerned. */
export interface PendingPush {
  id: string;
  recipientUserId: Id;
  groupId: Id;
  kind: PushKind;
  actorUserId: Id | null;
  /** For entry changes: the kind of entry, so expenses and settlements are counted apart. */
  entryKind: Entry['kind'] | null;
  /** ISO timestamp of the change. */
  createdAt: string;
}

export interface PushBurstOptions {
  /** A burst ends when nothing new arrived for this long. */
  quietMs: number;
  /** A burst that keeps going is sent anyway once its oldest push waited this long. */
  maxWaitMs: number;
}

export const defaultPushBurstOptions: PushBurstOptions = { quietMs: 30_000, maxWaitMs: 120_000 };

function burstKey(p: PendingPush): string {
  switch (p.kind) {
    // Personal and rare: never merged.
    case 'nudge':
    case 'claim':
      return `${p.kind}|${p.id}`;
    // Only "refresh this group": one per recipient and group.
    case 'sync':
      return `sync|${p.recipientUserId}|${p.groupId}`;
    default:
      return [p.kind, p.recipientUserId, p.groupId, p.actorUserId, p.entryKind].join('|');
  }
}

/**
 * Groups pending pushes into notifications ("Kasia added 3 expenses"): the
 * same kind of change to the same kind of entry by the same author in the same
 * group for the same recipient forms a burst. Returns the bursts that are
 * ready at `now` (each oldest first) — quiet for `quietMs`, or waiting for
 * `maxWaitMs`; nudges and claims are always ready. The rest stays queued.
 */
export function groupPushBursts<P extends PendingPush>(
  pending: readonly P[],
  now: string,
  options: PushBurstOptions = defaultPushBurstOptions,
): P[][] {
  const bursts = new Map<string, P[]>();
  const ordered = [...pending].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const p of ordered) {
    const key = burstKey(p);
    bursts.set(key, [...(bursts.get(key) ?? []), p]);
  }
  const at = Date.parse(now);
  return [...bursts.values()].filter((burst) => {
    const first = burst[0]!;
    const last = burst.at(-1)!;
    if (first.kind === 'nudge' || first.kind === 'claim') return true;
    return at - Date.parse(last.createdAt) >= options.quietMs || at - Date.parse(first.createdAt) >= options.maxWaitMs;
  });
}

/** A ready burst, summarized for its text. */
export interface PushSummary {
  kind: Exclude<PushKind, 'sync'>;
  entryKind: Entry['kind'] | null;
  /** Pushes in the burst. */
  count: number;
  /** The author's member name in the group; `null` = the name was removed (ADR-0019). */
  actorName: string | null;
  /** Title of the (newest) entry; `null` for settlements. */
  entryTitle: string | null;
  /** Settlement amount or the nudged debt, in minor units of `currency`. */
  amount: number | null;
  currency: string | null;
  /** Claimed member's name. */
  memberName: string | null;
}

type PluralForms = { one: string; few: string; many: string };
const plNouns: Record<Entry['kind'], PluralForms> = {
  expense: { one: 'wydatek', few: 'wydatki', many: 'wydatków' },
  income: { one: 'wpływ', few: 'wpływy', many: 'wpływów' },
  settlement: { one: 'spłatę', few: 'spłaty', many: 'spłat' },
};
const enNouns: Record<Entry['kind'], { one: string; other: string }> = {
  expense: { one: 'expense', other: 'expenses' },
  income: { one: 'income', other: 'incomes' },
  settlement: { one: 'settlement', other: 'settlements' },
};
const plVerbs = { entryCreated: 'dodano', entryEdited: 'zmieniono', entryDeleted: 'usunięto' } as const;
const enVerbs = { entryCreated: 'added', entryEdited: 'edited', entryDeleted: 'deleted' } as const;

function plPlural(count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules('pl').select(count);
  return category === 'one' ? forms.one : category === 'few' ? forms.few : forms.many;
}

/**
 * The text of a notification in `locale` (PL or EN, English otherwise).
 * Polish avoids gendered verbs ("Kasia: dodano 3 wydatki") except for the
 * claim, which matches the claim system message.
 */
export function pushMessageBody(summary: PushSummary, locale: string): string {
  const s = { ...summary, actorName: summary.actorName ?? deletedUserName(locale) };
  const polish = locale.split('-')[0] === 'pl';
  const money = s.amount !== null && s.currency ? formatAmount(s.amount, s.currency, polish ? 'pl' : 'en') : null;
  switch (s.kind) {
    case 'nudge':
      if (polish) return money ? `${s.actorName} przypomina o zwrocie ${money}` : `${s.actorName} przypomina o rozliczeniu`;
      return money ? `${s.actorName} reminds you to pay back ${money}` : `${s.actorName} reminds you to settle up`;
    case 'claim':
      if (s.memberName === null) return polish ? `Przejęcie profilu: ${s.actorName}` : `${s.actorName} claimed a profile`;
      return polish
        ? `Przejęcie profilu ${s.memberName}: ${s.actorName}`
        : `${s.actorName} claimed the ${s.memberName} profile`;
  }
  const entryKind = s.entryKind ?? 'expense';
  if (s.kind === 'entryCreated' && entryKind === 'settlement') {
    if (polish) {
      const nominative = { one: 'spłata', few: 'spłaty', many: 'spłat' };
      return s.count === 1
        ? `${s.actorName}: spłata dla Ciebie${money ? ` · ${money}` : ''}`
        : `${s.actorName}: ${s.count} ${plPlural(s.count, nominative)} dla Ciebie`;
    }
    return s.count === 1
      ? `${s.actorName} paid you back${money ? ` · ${money}` : ''}`
      : `${s.actorName} paid you back ${s.count} times`;
  }
  const title = s.count === 1 && s.entryTitle ? s.entryTitle : null;
  if (polish) {
    const verb = plVerbs[s.kind];
    const noun = plNouns[entryKind];
    if (s.count > 1) return `${s.actorName}: ${verb} ${s.count} ${plPlural(s.count, noun)}`;
    return title ? `${s.actorName}: ${verb} ${noun.one} „${title}”` : `${s.actorName}: ${verb} ${noun.one}`;
  }
  const verb = enVerbs[s.kind];
  const noun = enNouns[entryKind];
  if (s.count > 1) return `${s.actorName} ${verb} ${s.count} ${noun.other}`;
  return title ? `${s.actorName} ${verb} the ${noun.one} “${title}”` : `${s.actorName} ${verb} ${entryKind === 'income' ? 'an' : 'a'} ${noun.one}`;
}

/** A member can be nudged ("Przypomnij") once per this period, per group, by anyone. */
export const NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** When the member can be nudged again after the last nudge (ISO), `null` if never nudged. */
export function nextNudgeAt(lastNudgeAt: string | null): string | null {
  return lastNudgeAt === null ? null : new Date(Date.parse(lastNudgeAt) + NUDGE_INTERVAL_MS).toISOString();
}

/** Whether a nudge is allowed at `now` (ISO) given the last nudge of that member in that group. */
export function canNudge(lastNudgeAt: string | null, now: string): boolean {
  const next = nextNudgeAt(lastNudgeAt);
  return next === null || Date.parse(now) >= Date.parse(next);
}
