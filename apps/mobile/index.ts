// Intl polyfills must load before Lingui evaluates any message.
import './src/i18n/polyfills';
// Unistyles must be configured before any screen is loaded.
import './src/styles/unistyles';
import 'expo-router/entry';
