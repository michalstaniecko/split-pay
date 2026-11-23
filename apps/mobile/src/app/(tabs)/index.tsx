import { splitEvenly } from '@split-pay/shared';
import { PlaceholderScreen } from '@/components/placeholder-screen';

// Tymczasowo: dowód, że logika z packages/shared działa w aplikacji.
const demo = splitEvenly(10_000, ['a', 'b', 'c'])
  .map((a) => (a.amount / 100).toFixed(2))
  .join(' + ');

export default function GroupsScreen() {
  return <PlaceholderScreen title="Grupy" subtitle={`100,00 / 3 = ${demo}`} />;
}
