import { z } from 'zod';

/**
 * A change of a group's settings (Group info → settings). Every field is
 * optional; only the given ones change. Later settings (base currency,
 * dates, …) add their fields here.
 */
export const GroupSettingsUpdate = z
  .object({
    /** Debt simplification: minimum number of transfers (default on). */
    simplifyDebts: z.boolean().optional(),
  })
  .strict();
export type GroupSettingsUpdate = z.infer<typeof GroupSettingsUpdate>;
