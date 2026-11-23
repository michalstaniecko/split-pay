import {
  type Allocation,
  type Member,
  type MemberAmount,
  resolveSplit,
  type Split,
  type SplitMode,
} from '@split-pay/shared';
import { parseAmountInput } from './amount-input';

/**
 * The split section of the full expense form, as typed. Every mode keeps its
 * own values, so switching modes back and forth loses nothing. Who takes part
 * in an equal split (and shares the common part) is the form's
 * `participantIds`, which follow attendance on a date change (#15).
 */
export interface SplitForm {
  mode: SplitMode;
  /** Exact amounts per member id, as typed. */
  exact: Record<string, string>;
  /** Weights per member id, as typed (digits only). */
  weights: Record<string, string>;
  /** Personal items per member id, as typed. */
  personal: Record<string, string>;
}

export const initialSplitForm: SplitForm = { mode: 'equal', exact: {}, weights: {}, personal: {} };

/** Highest weight the form accepts (the shared schema allows up to 1000). */
export const MAX_WEIGHT_DIGITS = 3;

/** Keeps the digits of a typed weight. */
export function cleanWeightInput(text: string): string {
  return text.replace(/\D/g, '').slice(0, MAX_WEIGHT_DIGITS);
}

/** Participants in member order; an empty list (nobody present that day) means everyone. */
export function effectiveParticipants(participantIds: readonly string[], members: readonly Member[]): string[] {
  if (participantIds.length === 0) return members.map((m) => m.id);
  const picked = new Set(participantIds);
  return members.filter((m) => picked.has(m.id)).map((m) => m.id);
}

/** Adds or removes a participant (member order). The last one stays — a split needs someone. */
export function toggleParticipant(participantIds: readonly string[], memberId: string, members: readonly Member[]): string[] {
  const current = effectiveParticipants(participantIds, members);
  if (!current.includes(memberId)) return effectiveParticipants([...current, memberId], members);
  return current.length > 1 ? current.filter((id) => id !== memberId) : current;
}

export type SplitProblem =
  | { kind: 'noAmount' }
  | { kind: 'noParticipants' }
  | { kind: 'exactMismatch'; sum: number; amount: number }
  | { kind: 'noPersonal' }
  | { kind: 'personalExceeds'; sum: number; amount: number }
  | { kind: 'noCommonMembers' };

export type SplitResult = { ok: true; split: Split; shares: Allocation[] } | { ok: false; problem: SplitProblem };

const sum = (xs: readonly { amount: number }[]) => xs.reduce((acc, x) => acc + x.amount, 0);

/** Typed amounts per member → positive amounts in member order; empty and zero fields are left out. */
function typedAmounts(values: Record<string, string>, ids: readonly string[], digits: number): MemberAmount[] {
  return ids.flatMap((memberId) => {
    const amount = parseAmountInput(values[memberId] ?? '', digits);
    return amount === null ? [] : [{ memberId, amount }];
  });
}

/**
 * The split the form describes and each member's share (the live preview,
 * via the shared `resolveSplit`), or why it can't be saved yet.
 * `amount`: the entry amount in minor units (`null` while not typed).
 */
export function buildSplit(
  split: SplitForm,
  context: { amount: number | null; digits: number; members: readonly Member[]; participantIds: readonly string[] },
): SplitResult {
  const { amount, digits, members } = context;
  const participants = effectiveParticipants(context.participantIds, members);
  if (amount === null) return { ok: false, problem: { kind: 'noAmount' } };
  const ids = members.map((m) => m.id);
  let result: Split;
  switch (split.mode) {
    case 'equal': {
      if (participants.length === 0) return { ok: false, problem: { kind: 'noParticipants' } };
      result = { mode: 'equal', memberIds: participants };
      break;
    }
    case 'exact': {
      const amounts = typedAmounts(split.exact, ids, digits);
      if (amounts.length === 0 || sum(amounts) !== amount) {
        return { ok: false, problem: { kind: 'exactMismatch', sum: sum(amounts), amount } };
      }
      result = { mode: 'exact', amounts };
      break;
    }
    case 'shares': {
      const weights = ids.flatMap((memberId) => {
        const weight = Number(split.weights[memberId] ?? '');
        return Number.isInteger(weight) && weight > 0 ? [{ memberId, weight }] : [];
      });
      if (weights.length === 0) return { ok: false, problem: { kind: 'noParticipants' } };
      result = { mode: 'shares', weights };
      break;
    }
    case 'commonPlusPersonal': {
      const personal = typedAmounts(split.personal, ids, digits);
      if (personal.length === 0) return { ok: false, problem: { kind: 'noPersonal' } };
      if (sum(personal) > amount) return { ok: false, problem: { kind: 'personalExceeds', sum: sum(personal), amount } };
      if (sum(personal) < amount && participants.length === 0) {
        return { ok: false, problem: { kind: 'noCommonMembers' } };
      }
      result = { mode: 'commonPlusPersonal', commonMemberIds: participants, personal };
      break;
    }
  }
  return { ok: true, split: result, shares: resolveSplit(result, amount) };
}

/** Payers as typed: one payer by default; multiple payers with amounts behind an advanced option (ADR-0004). */
export interface PayersForm {
  multiple: boolean;
  /** Amount paid per member id, as typed (multiple payers only). */
  amounts: Record<string, string>;
}

export const initialPayersForm: PayersForm = { multiple: false, amounts: {} };

export type PayersProblem = { kind: 'noAmount' } | { kind: 'noPayers' } | { kind: 'payersMismatch'; sum: number; amount: number };

/** Turns on multiple payers; without amounts typed yet, the single payer starts with the whole amount. */
export function withMultiplePayers(payers: PayersForm, payerMemberId: string, amount: string): PayersForm {
  const hasAmounts = Object.values(payers.amounts).some((a) => a.trim() !== '');
  return { multiple: true, amounts: hasAmounts || payerMemberId === '' ? payers.amounts : { [payerMemberId]: amount } };
}

/** Who paid how much; with multiple payers the typed amounts must add up to the entry amount. */
export function buildPayers(
  payerMemberId: string,
  payers: PayersForm,
  context: { amount: number | null; digits: number },
): { ok: true; payers: MemberAmount[] } | { ok: false; problem: PayersProblem } {
  const { amount, digits } = context;
  if (amount === null) return { ok: false, problem: { kind: 'noAmount' } };
  if (!payers.multiple) {
    if (payerMemberId === '') return { ok: false, problem: { kind: 'noPayers' } };
    return { ok: true, payers: [{ memberId: payerMemberId, amount }] };
  }
  const ids = Object.keys(payers.amounts).sort();
  const list = typedAmounts(payers.amounts, ids, digits);
  if (list.length === 0) return { ok: false, problem: { kind: 'noPayers' } };
  if (sum(list) !== amount) return { ok: false, problem: { kind: 'payersMismatch', sum: sum(list), amount } };
  return { ok: true, payers: list };
}
