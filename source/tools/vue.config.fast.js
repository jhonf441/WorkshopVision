// vue-cli config used by build.py to compile a plugin quickly (VUE_CLI_SERVICE_CONFIG_PATH). It wraps the config of dwc-src without
// touching it: a plugin build runs the whole DWC build, and the stock config spends most of the time on things a plugin zip never uses.
//   - persistent webpack cache (filesystem): the second build only recompiles what changed
//   - no source maps (devtool), no .gz copies (CompressionPlugin), no service worker (workbox): none of them is packed in the zip
//     (build-plugin.js packs the plugin's own js/css chunks; the .map and .gz of those chunks were riding along in the zip)
// TALLER_BUILD_COMPLETO=1 makes build.py use the stock config again (maps, .gz, no cache).
const path = require("path");
const dwc = process.env.TALLER_DWC_SRC || path.resolve(__dirname, "..", "..", "dwc-src");
const base = require(path.join(dwc, "vue.config.js"));
const { merge } = require(path.join(dwc, "node_modules", "webpack-merge"));
const CompressionPlugin = require(path.join(dwc, "node_modules", "compression-webpack-plugin"));

const cfg = base.configureWebpack || {};
const sinGz = Object.assign({}, cfg, { plugins: (cfg.plugins || []).filter((p) => !(p instanceof CompressionPlugin)) });

module.exports = Object.assign({}, base, {
  productionSourceMap: false,
  configureWebpack: merge(sinGz, {
    devtool: false,
    cache: {
      type: "filesystem",
      cacheDirectory: path.join(dwc, "node_modules", ".cache", "taller-webpack"),
      buildDependencies: { config: [__filename, path.join(dwc, "vue.config.js")] },
    },
  }),
  chainWebpack: (config) => {
    if (base.chainWebpack) base.chainWebpack(config);
    config.plugins.delete("workbox");
  },
});
