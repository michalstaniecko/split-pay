import { useCallback, useState } from 'react';

/**
 * Props for a `RefreshControl` whose spinner shows only for a pull the user made.
 *
 * Binding `refreshing` to a query's `isRefetching` also shows the spinner for
 * background refetches (`useRefreshOnFocus`), and on iOS that slides the list
 * down and back up every time the screen regains focus.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}
