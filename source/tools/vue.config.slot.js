// vue-cli config for the FULL build (--completa) in a build slot: the stock config of the clone plus the stable-module-ids plugin, so the
// modules reached through the node_modules junction keep their "./node_modules/..." ids (tools/webpack-stable-module-ids.js).
const path = require("path");
const dwc = process.env.TALLER_DWC_SRC || path.resolve(__dirname, "..", "..", "dwc-src");
const base = require(path.join(dwc, "vue.config.js"));
const StableModuleIds = require("./webpack-stable-module-ids");
const { merge } = require(path.join(dwc, "node_modules", "webpack-merge"));

module.exports = Object.assign({}, base, {
  configureWebpack: merge(base.configureWebpack || {}, { plugins: [new StableModuleIds()] }),
});
