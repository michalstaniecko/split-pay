module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Lingui macros (`@lingui/react/macro`, `@lingui/core/macro`) — must come first.
      '@lingui/babel-plugin-lingui-macro',
      ['react-native-unistyles/plugin', { root: 'src' }],
    ],
  };
};
