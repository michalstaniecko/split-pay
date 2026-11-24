import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Refetches when the screen regains focus (e.g. coming back from a pushed
 * screen or a sheet) — there is no realtime, so focus is when data refreshes.
 * Skips the first focus: the query has just loaded then.
 */
export function useRefreshOnFocus(refetch: () => Promise<unknown>) {
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch]),
  );
}
