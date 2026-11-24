import { t } from '@lingui/core/macro';
import {
  type Attendance,
  type Category,
  type Change,
  changedEntryFields,
  type Entry,
  formatAmount,
  formatDate,
  type MemberAmount,
  memberName,
  resolveSplit,
  type SplitMode,
} from '@split-pay/shared';

export interface ChangeDescriptionContext {
  locale: string;
  /** The current name of a member (renames show up everywhere, like in the Conversation). */
  memberName: (memberId: string) => string;
  categoryName: (category: Category) => string;
  splitModeName: (mode: SplitMode) => string;
}

/** A history row's text: one line saying what happened, plus "before → after" lines for edits. */
export interface ChangeDescription {
  title: string;
  details: string[];
}

/**
 * Human-readable description of a recorded change (#20), in the active UI
 * language. Impersonal ("Dodano wydatek …") — who did it is shown next to it,
 * so the Polish copy needs no gendered verb forms.
 */
export function describeChange(change: Change, context: ChangeDescriptionContext): ChangeDescription {
  const only = (title: string): ChangeDescription => ({ title, details: [] });
  const entryText = (entry: Entry) => entryPhrase(entry, context);
  const withAmount = (entry: Entry) => `${entryText(entry)}, ${formatAmount(entry.amount, entry.currency, context.locale)}`;
  switch (change.kind) {
    case 'group.create': {
      const group = `${change.after.emoji} ${change.after.name}`;
      return only(t`Utworzono grupę ${group}`);
    }
    case 'group.archive':
      return only(t`Zarchiwizowano grupę`);
    case 'group.unarchive':
      return only(t`Przywrócono grupę z archiwum`);
    case 'member.leave': {
      const name = context.memberName(change.targetId);
      return only(t`Opuszczenie grupy: ${name}`);
    }
    case 'entry.create': {
      const what = withAmount(change.after);
      return only(t`Dodano ${what}`);
    }
    case 'entry.delete': {
      const what = withAmount(change.after);
      return only(t`Usunięto ${what}`);
    }
    case 'entry.restore': {
      const what = withAmount(change.after);
      return only(t`Przywrócono ${what}`);
    }
    case 'entry.edit': {
      const what = entryText(change.after);
      return { title: t`Zmieniono ${what}`, details: entryEditDetails(change.before, change.after, context) };
    }
    case 'member.add': {
      const name = memberName(change.after, context.locale);
      return only(t`Dodano osobę bez konta: ${name}`);
    }
    case 'member.join': {
      const name = memberName(change.after, context.locale);
      return only(t`Dołączenie do grupy: ${name}`);
    }
    case 'member.rename': {
      // A removed name (ADR-0019) reads "Deleted user" in the viewer's language.
      const before = memberName(change.before, context.locale);
      const after = memberName(change.after, context.locale);
      return only(t`Zmieniono imię: ${before} → ${after}`);
    }
    case 'member.attendance': {
      const name = context.memberName(change.targetId);
      const before = attendanceText(change.before.attendance, context.locale);
      const after = attendanceText(change.after.attendance, context.locale);
      return { title: t`Zmieniono obecność: ${name}`, details: [`${before} → ${after}`] };
    }
    case 'settings.update':
      return {
        title:
          change.after.simplifyDebts === undefined
            ? t`Zmieniono ustawienia grupy`
            : change.after.simplifyDebts
              ? t`Włączono upraszczanie długów`
              : t`Wyłączono upraszczanie długów`,
        details: [],
      };
    case 'claim': {
      const name = context.memberName(change.targetId);
      return only(t`Przejęto profil ${name}`);
    }
    case 'claim.undo': {
      const name = context.memberName(change.targetId);
      return only(t`Cofnięto przejęcie profilu ${name}`);
    }
  }
}

/** "wydatek „Pizza”" / "wpływ „Zwrot kaucji”" / "spłatę Bartek → Ania" (Polish accusative, after the verb). */
function entryPhrase(entry: Entry, context: ChangeDescriptionContext): string {
  if (entry.kind === 'settlement') {
    const from = context.memberName(entry.from);
    const to = context.memberName(entry.to);
    return t`spłatę ${from} → ${to}`;
  }
  const title = entry.title;
  return entry.kind === 'expense' ? t`wydatek „${title}”` : t`wpływ „${title}”`;
}

/** One "Pole: przed → po" line per changed group of fields. */
function entryEditDetails(before: Entry, after: Entry, context: ChangeDescriptionContext): string[] {
  const changed = new Set(changedEntryFields(before, after));
  const lines: string[] = [];
  const arrow = (a: string, b: string) => `${a} → ${b}`;
  const kindName = (entry: Entry) =>
    entry.kind === 'expense' ? t`wydatek` : entry.kind === 'income' ? t`wpływ` : t`spłata`;
  const money = (amount: number, currency: string) => formatAmount(amount, currency, context.locale);

  if (changed.has('kind')) {
    const value = arrow(kindName(before), kindName(after));
    lines.push(t`Rodzaj: ${value}`);
  }
  if (changed.has('title')) {
    const value = arrow(titleOf(before), titleOf(after));
    lines.push(t`Tytuł: ${value}`);
  }
  if (changed.has('amount') || changed.has('currency')) {
    const value = arrow(money(before.amount, before.currency), money(after.amount, after.currency));
    lines.push(t`Kwota: ${value}`);
  }
  if (changed.has('rateToBase')) {
    const value = arrow(before.rateToBase, after.rateToBase);
    lines.push(t`Kurs: ${value}`);
  }
  if (changed.has('date')) {
    const value = arrow(formatDate(before.date, context.locale), formatDate(after.date, context.locale));
    lines.push(t`Data: ${value}`);
  }
  if (changed.has('category') && before.kind !== 'settlement' && after.kind !== 'settlement') {
    const value = arrow(context.categoryName(before.category), context.categoryName(after.category));
    lines.push(t`Kategoria: ${value}`);
  }
  const holders = (list: readonly MemberAmount[] | undefined, currency: string) => {
    if (!list || list.length === 0) return '—';
    if (list.length === 1) return context.memberName(list[0]!.memberId);
    return list.map((h) => `${context.memberName(h.memberId)} ${money(h.amount, currency)}`).join(', ');
  };
  if (changed.has('payers') && (before.kind === 'expense' || after.kind === 'expense')) {
    const value = arrow(
      holders(before.kind === 'expense' ? before.payers : undefined, before.currency),
      holders(after.kind === 'expense' ? after.payers : undefined, after.currency),
    );
    lines.push(t`Płacący: ${value}`);
  }
  if (changed.has('recipients') && (before.kind === 'income' || after.kind === 'income')) {
    const value = arrow(
      holders(before.kind === 'income' ? before.recipients : undefined, before.currency),
      holders(after.kind === 'income' ? after.recipients : undefined, after.currency),
    );
    lines.push(t`Otrzymujący: ${value}`);
  }
  if ((changed.has('split') || changed.has('amount')) && before.kind !== 'settlement' && after.kind !== 'settlement') {
    const splitText = (entry: Exclude<Entry, { kind: 'settlement' }>) => {
      const people = resolveSplit(entry.split, entry.amount)
        .filter((share) => share.amount !== 0)
        .map((share) => context.memberName(share.memberId))
        .join(', ');
      return `${context.splitModeName(entry.split.mode)} · ${people}`;
    };
    const [a, b] = [splitText(before), splitText(after)];
    if (a !== b) {
      const value = arrow(a, b);
      lines.push(t`Podział: ${value}`);
    }
  }
  if (before.kind === 'settlement' && after.kind === 'settlement') {
    if (changed.has('from')) {
      const value = arrow(context.memberName(before.from), context.memberName(after.from));
      lines.push(t`Od: ${value}`);
    }
    if (changed.has('to')) {
      const value = arrow(context.memberName(before.to), context.memberName(after.to));
      lines.push(t`Do: ${value}`);
    }
  }
  if (changed.has('receiptPhotoId')) lines.push(t`Zmieniono zdjęcie paragonu`);
  return lines;
}

function titleOf(entry: Entry): string {
  if (entry.kind === 'settlement') return '—';
  const title = entry.title;
  return t`„${title}”`;
}

/** "cały wyjazd" or the ranges: "10 lipca 2026 – 11 lipca 2026, 13 lipca 2026 – 14 lipca 2026". */
function attendanceText(attendance: Attendance | null, locale: string): string {
  if (attendance === null) return t`cały wyjazd`;
  if (attendance.length === 0) return t`nieobecność`;
  return attendance
    .map((range) =>
      range.from === range.to
        ? formatDate(range.from, locale)
        : `${formatDate(range.from, locale)} – ${formatDate(range.to, locale)}`,
    )
    .join(', ');
}
