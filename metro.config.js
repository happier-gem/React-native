const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// admin/ is the Next.js web admin living in the same repo. It has its own
// node_modules and build output, none of which the mobile bundler should crawl.
const adminDir = path.join(__dirname, "admin").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${adminDir}[\\\\/].*`, "i"),
];

module.exports = withNativewind(config);
