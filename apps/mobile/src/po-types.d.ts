// `.po` catalogs are compiled on import by @lingui/metro-transformer (app)
// and @lingui/vite-plugin (tests).
declare module '*.po' {
  import type { Messages } from '@lingui/core';
  export const messages: Messages;
}
