// Web: localStorage, so the web build needs no SQLite/WASM setup for this.
const prefix = 'split-pay.';

export const deviceStorage = {
  getItem: (key: string): string | null => globalThis.localStorage?.getItem(prefix + key) ?? null,
  setItem: (key: string, value: string): void => globalThis.localStorage?.setItem(prefix + key, value),
};
