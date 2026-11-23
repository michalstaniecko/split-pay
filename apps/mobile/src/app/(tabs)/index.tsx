import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { splitEvenly } from '@split-pay/shared';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { useFormatters } from '@/i18n/use-formatters';

// Temporary: proof that packages/shared logic runs in the app.
const total = 10_000;
const shares = splitEvenly(total, ['a', 'b', 'c']);

export default function GroupsScreen() {
  const { t } = useLingui();
  const format = useFormatters();
  const amount = format.amount(total, 'PLN');
  const count = shares.length;
  const summary = t`Podział ${amount} na ${plural(count, { one: '# osobę', few: '# osoby', many: '# osób', other: '# osoby' })}`;
  const parts = shares.map((s) => format.amount(s.amount, 'PLN')).join(' + ');
  return <PlaceholderScreen title={t`Grupy`} subtitle={`${summary}\n${parts}`} />;
}
