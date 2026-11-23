// Hermes lacks Intl.PluralRules (needed by Lingui's ICU plurals) and a full
// Intl.Locale. `polyfill-force` skips the slow feature detection on startup.
// Add the locale data of every new UI language here.
import '@formatjs/intl-locale/polyfill-force.js';
import '@formatjs/intl-pluralrules/polyfill-force.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/pl.js';
