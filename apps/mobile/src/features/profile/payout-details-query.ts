import type { PayoutDetails } from '@split-pay/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { api } from '@/lib/api';

const myPayoutDetailsKey = ['me', 'payout-details'] as const;

/** My payout details (GET /me/payout-details). */
export const myPayoutDetailsQuery = () =>
  queryOptions({
    queryKey: myPayoutDetailsKey,
    queryFn: () => parseResponse(api.me['payout-details'].$get()),
  });

/** Saves my payout details (PUT /me/payout-details); empty fields clear them. */
export function useSavePayoutDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PayoutDetails) => parseResponse(api.me['payout-details'].$put({ json: input })),
    onSuccess: (saved) => queryClient.setQueryData(myPayoutDetailsKey, saved),
  });
}
