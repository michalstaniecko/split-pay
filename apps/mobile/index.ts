// Intl polyfills must load before Lingui evaluates any message.
import './src/i18n/polyfills';
// Unistyles must be configured before any screen is loaded.
import './src/styles/unistyles';
// The background task for silent sync pushes must be defined before the app renders.
import './src/features/notifications/background-sync';
import 'expo-router/entry';
