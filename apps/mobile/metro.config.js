const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Expo's default config plus Sentry debug ids (source maps). No web replay or feedback
// widget: they would record what people see and type.
const config = getSentryExpoConfig(__dirname, { includeWebReplay: false, includeWebFeedback: false });
const { transformer, resolver } = config;

// Lingui: compile `.po` catalogs on import (src/i18n/i18n.ts).
config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('@lingui/metro-transformer/expo'),
};
config.resolver = {
  ...resolver,
  sourceExts: [...resolver.sourceExts, 'po', 'pot'],
};

module.exports = config;
