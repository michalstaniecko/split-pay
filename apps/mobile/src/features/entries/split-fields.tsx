import { useLingui } from '@lingui/react/macro';
import type { Member, SplitMode } from '@split-pay/shared';
import type { Named } from '@/features/groups/member-name';
import { Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useFormatters } from '@/i18n/use-formatters';
import { cleanAmountInput } from './amount-input';
import {
  buildPayers,
  buildSplit,
  cleanWeightInput,
  type PayersForm,
  type PayersProblem,
  effectiveParticipants,
  type SplitForm,
  type SplitProblem,
  toggleParticipant,
  withMultiplePayers,
} from './split-form';
import { useEntryLabels } from './use-entry-labels';

const SPLIT_MODES: readonly SplitMode[] = ['equal', 'exact', 'shares', 'commonPlusPersonal'];

/** Mismatch messages shared by the payers and the split sections. */
function useProblemMessage(currency: string) {
  const { t } = useLingui();
  const format = useFormatters();
  return (problem: SplitProblem | PayersProblem): string | null => {
    const money = (minor: number) => format.amount(minor, currency);
    switch (problem.kind) {
      case 'noAmount':
        return null;
      case 'noParticipants':
        return t`Wybierz co najmniej jedną osobę.`;
      case 'noPayers':
        return t`Wpisz, ile zapłaciła co najmniej jedna osoba.`;
      case 'noPersonal':
        return t`Wpisz co najmniej jedną pozycję osobistą.`;
      case 'noCommonMembers':
        return t`Wybierz, kto dzieli część wspólną.`;
      case 'personalExceeds':
        return t`Pozycje osobiste (${money(problem.sum)}) przekraczają kwotę wydatku (${money(problem.amount)}).`;
      case 'exactMismatch':
      case 'payersMismatch': {
        const sum = money(problem.sum);
        const total = money(problem.amount);
        const diff = money(Math.abs(problem.amount - problem.sum));
        return problem.sum < problem.amount
          ? t`Kwoty sumują się do ${sum} z ${total} — brakuje ${diff}.`
          : t`Kwoty sumują się do ${sum} z ${total} — o ${diff} za dużo.`;
      }
    }
  };
}

/**
 * Who paid: one payer by default (chips); "Kilka osób płaciło" switches to
 * amounts per member that must add up to the expense amount (ADR-0004).
 * For an income (#13) the same field picks the recipient(s).
 */
export function PayersField({
  members,
  myMemberId,
  payerMemberId,
  payers,
  amountText,
  amount,
  digits,
  currency,
  showErrors,
  onChangePayer,
  onChangePayers,
  income = false,
}: {
  members: readonly Named<Member>[];
  myMemberId: string | null;
  payerMemberId: string;
  payers: PayersForm;
  amountText: string;
  amount: number | null;
  digits: number;
  currency: string;
  showErrors: boolean;
  onChangePayer: (memberId: string) => void;
  onChangePayers: (payers: PayersForm) => void;
  /** Income (#13): the payers are its recipients. */
  income?: boolean;
}) {
  const { t } = useLingui();
  const problemMessage = useProblemMessage(currency);
  const name = (m: Named<Member>) => (m.id === myMemberId ? t`Ty` : m.displayName);
  const result = buildPayers(payerMemberId, payers, { amount, digits });
  const message = payers.multiple && !result.ok ? problemMessage(result.problem) : null;
  const label = income ? t`Kto otrzymuje` : t`Kto zapłacił`;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {payers.multiple ? (
        members.map((m) => (
          <AmountRow
            key={m.id}
            label={name(m)}
            value={payers.amounts[m.id] ?? ''}
            suffix={currency}
            onChange={(text) =>
              onChangePayers({ ...payers, amounts: { ...payers.amounts, [m.id]: cleanAmountInput(text, digits) } })
            }
          />
        ))
      ) : (
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
          {members.map((m) => (
            <Chip
              key={m.id}
              role="radio"
              label={name(m)}
              selected={payerMemberId === m.id}
              onPress={() => onChangePayer(m.id)}
            />
          ))}
        </View>
      )}
      {message ? <Text style={showErrors ? styles.error : styles.hint}>{message}</Text> : null}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: payers.multiple }}
        onPress={() =>
          onChangePayers(
            payers.multiple ? { ...payers, multiple: false } : withMultiplePayers(payers, payerMemberId, amountText),
          )
        }
        hitSlop={{ top: 4, bottom: 4 }}
        style={styles.toggle}>
        <Text style={styles.toggleText}>{income
            ? payers.multiple
              ? t`Jedna osoba otrzymała`
              : t`Kilka osób otrzymało`
            : payers.multiple
              ? t`Jedna osoba zapłaciła`
              : t`Kilka osób płaciło`}</Text>
      </Pressable>
    </View>
  );
}

/** Split mode, its values per member and the live preview of every member's share (`resolveSplit`). */
export function SplitField({
  members,
  myMemberId,
  split,
  participantIds,
  amount,
  digits,
  currency,
  showErrors,
  onChange,
  onChangeParticipants,
}: {
  members: readonly Named<Member>[];
  myMemberId: string | null;
  split: SplitForm;
  /** Equal split / common part participants (the form's `participantIds`, empty = everyone). */
  participantIds: readonly string[];
  amount: number | null;
  digits: number;
  currency: string;
  showErrors: boolean;
  onChange: (split: SplitForm) => void;
  onChangeParticipants: (participantIds: string[]) => void;
}) {
  const { t } = useLingui();
  const labels = useEntryLabels();
  const format = useFormatters();
  const problemMessage = useProblemMessage(currency);
  const name = (m: Named<Member>) => (m.id === myMemberId ? t`Ty` : m.displayName);
  const result = buildSplit(split, { amount, digits, members, participantIds });
  const message = result.ok ? null : problemMessage(result.problem);
  const participants = effectiveParticipants(participantIds, members);

  const participantChips = (
    <View style={styles.chips}>
      {members.map((m) => (
        <Chip
          key={m.id}
          role="checkbox"
          label={name(m)}
          selected={participants.includes(m.id)}
          onPress={() => onChangeParticipants(toggleParticipant(participantIds, m.id, members))}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{t`Podział`}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t`Podział`}>
        {SPLIT_MODES.map((mode) => (
          <Chip
            key={mode}
            role="radio"
            label={labels.splitMode[mode]}
            selected={split.mode === mode}
            onPress={() => onChange({ ...split, mode })}
          />
        ))}
      </View>

      {split.mode === 'equal' ? participantChips : null}
      {split.mode === 'exact'
        ? members.map((m) => (
            <AmountRow
              key={m.id}
              label={name(m)}
              value={split.exact[m.id] ?? ''}
              suffix={currency}
              onChange={(text) => onChange({ ...split, exact: { ...split.exact, [m.id]: cleanAmountInput(text, digits) } })}
            />
          ))
        : null}
      {split.mode === 'shares'
        ? members.map((m) => (
            <AmountRow
              key={m.id}
              label={name(m)}
              value={split.weights[m.id] ?? ''}
              suffix={t`udz.`}
              keyboardType="number-pad"
              onChange={(text) => onChange({ ...split, weights: { ...split.weights, [m.id]: cleanWeightInput(text) } })}
            />
          ))
        : null}
      {split.mode === 'commonPlusPersonal' ? (
        <>
          <Text style={styles.hint}>{t`Pozycje osobiste`}</Text>
          {members.map((m) => (
            <AmountRow
              key={m.id}
              label={name(m)}
              value={split.personal[m.id] ?? ''}
              suffix={currency}
              onChange={(text) =>
                onChange({ ...split, personal: { ...split.personal, [m.id]: cleanAmountInput(text, digits) } })
              }
            />
          ))}
          <Text style={styles.hint}>{t`Resztę dzielą po równo`}</Text>
          {participantChips}
        </>
      ) : null}

      {result.ok ? (
        <View style={styles.preview}>
          {result.shares.map((share) => {
            const m = members.find((x) => x.id === share.memberId);
            return (
              <View key={share.memberId} style={styles.previewRow} accessible>
                <Text style={styles.previewName}>{m ? name(m) : '?'}</Text>
                <Text style={styles.previewAmount}>{format.amount(share.amount, currency)}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {message ? <Text style={showErrors ? styles.error : styles.hint}>{message}</Text> : null}
    </View>
  );
}

function Chip({
  role,
  label,
  selected,
  onPress,
}: {
  role: 'radio' | 'checkbox';
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

function AmountRow({
  label,
  value,
  suffix,
  keyboardType = 'decimal-pad',
  onChange,
}: {
  label: string;
  value: string;
  suffix: string;
  keyboardType?: 'decimal-pad' | 'number-pad';
  onChange: (text: string) => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.amountRow}>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="0"
        accessibilityLabel={`${label}, ${suffix}`}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        style={styles.rowInput}
      />
      <Text style={styles.rowSuffix}>{suffix}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  field: {
    gap: theme.space(2),
  },
  label: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  hint: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  error: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.negative,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(2),
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
  toggle: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: theme.font.sizeSm,
    fontWeight: 'normal',
    color: theme.colors.primary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    minHeight: 44,
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowLabel: {
    flex: 1,
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  rowInput: {
    minWidth: 80,
    paddingVertical: theme.space(2),
    fontSize: theme.font.sizeMd,
    color: theme.colors.text,
  },
  rowSuffix: {
    fontSize: theme.font.sizeSm,
    color: theme.colors.textMuted,
  },
  preview: {
    paddingVertical: theme.space(1),
    paddingHorizontal: theme.space(3),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  previewName: {
    flexShrink: 1,
    fontSize: theme.font.sizeSm,
    color: theme.colors.text,
  },
  previewAmount: {
    fontSize: theme.font.sizeSm,
    fontWeight: theme.font.weightBold,
    color: theme.colors.text,
  },
}));
