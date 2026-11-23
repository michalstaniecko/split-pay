import { zValidator } from '@hono/zod-validator';
import { splitEvenly } from '@split-pay/shared';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { z } from 'zod';

export const app = new Hono()
  .use(logger())
  .get('/health', (c) => c.json({ status: 'ok' as const }))
  // Tymczasowy endpoint demonstracyjny — pokazuje, że logika z packages/shared
  // działa na serwerze. Do usunięcia, gdy powstaną prawdziwe zasoby.
  .post(
    '/dev/split-evenly',
    zValidator('json', z.object({ total: z.number().int(), memberIds: z.array(z.string()).min(1) })),
    (c) => {
      const { total, memberIds } = c.req.valid('json');
      return c.json({ allocations: splitEvenly(total, memberIds) });
    },
  );

export type AppType = typeof app;
