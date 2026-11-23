import Storage from 'expo-sqlite/kv-store';

// Small synchronous key-value store for device-local settings (theme, cached
// feature flags). Native: SQLite-backed, readable before the first render.
// Web: see device-storage.web.ts.
export const deviceStorage = {
  getItem: (key: string): string | null => Storage.getItemSync(key),
  setItem: (key: string, value: string): void => Storage.setItemSync(key, value),
};
