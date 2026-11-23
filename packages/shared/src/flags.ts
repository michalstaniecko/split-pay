/**
 * Feature flags: switches the API serves so features (ads, paid features) can
 * be turned on without a new app build. Every flag defaults to off, and an app
 * that cannot reach the API runs with the defaults or its last cached copy.
 */
export interface FeatureFlags {
  /** AdMob ads (SPEC: possibly later, behind a flag; ADR-0011). */
  ads: boolean;
}

export const defaultFeatureFlags: Readonly<FeatureFlags> = Object.freeze({ ads: false });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Lays `override` (untrusted: an API response, a cached copy, server config)
 * over `base`. Only flags this build knows are taken, and only with a value of
 * the right type — anything else keeps the base value.
 */
export function mergeFeatureFlags(override: unknown, base: FeatureFlags = defaultFeatureFlags): FeatureFlags {
  const merged: FeatureFlags = { ...base };
  if (!isRecord(override)) return merged;
  for (const key of Object.keys(base) as (keyof FeatureFlags)[]) {
    const value = override[key];
    if (typeof value === typeof base[key]) merged[key] = value as FeatureFlags[typeof key];
  }
  return merged;
}

/** Flags from a JSON config value (e.g. the API's `FEATURE_FLAGS` env var); defaults if missing or invalid. */
export function parseFeatureFlagsJson(json: string | undefined): FeatureFlags {
  if (!json) return mergeFeatureFlags(undefined);
  try {
    return mergeFeatureFlags(JSON.parse(json));
  } catch {
    return mergeFeatureFlags(undefined);
  }
}
