import { describe, expect, it } from 'vitest';
import { defaultFeatureFlags, mergeFeatureFlags, parseFeatureFlagsJson } from './flags';

describe('defaultFeatureFlags', () => {
  it('keeps every feature off', () => {
    expect(defaultFeatureFlags).toEqual({ ads: false });
  });
});

describe('mergeFeatureFlags', () => {
  it('falls back to the defaults when nothing is known', () => {
    expect(mergeFeatureFlags(undefined)).toEqual({ ads: false });
    expect(mergeFeatureFlags(null)).toEqual({ ads: false });
  });

  it('takes known flags from the override', () => {
    expect(mergeFeatureFlags({ ads: true })).toEqual({ ads: true });
  });

  it('ignores flags this build does not know', () => {
    expect(mergeFeatureFlags({ ads: true, paidExport: true })).toEqual({ ads: true });
  });

  it('keeps the default for a flag with a value of the wrong type', () => {
    expect(mergeFeatureFlags({ ads: 'yes' })).toEqual({ ads: false });
  });

  it('ignores an override that is not an object', () => {
    expect(mergeFeatureFlags('ads')).toEqual({ ads: false });
    expect(mergeFeatureFlags([true])).toEqual({ ads: false });
  });

  it('layers overrides on top of a base other than the defaults', () => {
    expect(mergeFeatureFlags({}, { ads: true })).toEqual({ ads: true });
    expect(mergeFeatureFlags({ ads: false }, { ads: true })).toEqual({ ads: false });
  });
});

describe('parseFeatureFlagsJson', () => {
  it('reads flags from a JSON config value', () => {
    expect(parseFeatureFlagsJson('{"ads":true}')).toEqual({ ads: true });
  });

  it('falls back to the defaults for a missing or broken value', () => {
    expect(parseFeatureFlagsJson(undefined)).toEqual({ ads: false });
    expect(parseFeatureFlagsJson('')).toEqual({ ads: false });
    expect(parseFeatureFlagsJson('not json')).toEqual({ ads: false });
  });
});
