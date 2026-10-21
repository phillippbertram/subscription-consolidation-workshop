/* global module */
module.exports = function (api) {
  api.cache(true);
  return {
    // `nativewind/babel` lists @babel/plugin-transform-react-jsx by name, and
    // Babel resolves plugin names from this directory. pnpm only links direct
    // dependencies here, so apps/mobile/package.json declares the plugin even
    // though no code imports it. Without that, bundling only works while pnpm's
    // bin shim puts its hoisted store on NODE_PATH and fails when Metro is
    // started any other way (for example by an IDE or a plain `node` call).
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
