import { queryOptions } from '@tanstack/react-query';
import { parseResponse } from 'hono/client';
import { api } from '@/lib/api';

/** The signed-in user, from the API (GET /me). */
export const meQuery = () =>
  queryOptions({
    queryKey: ['me'],
    queryFn: () => parseResponse(api.me.$get()),
  });
