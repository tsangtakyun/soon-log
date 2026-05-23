const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);
const escapedRoot = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

config.resolver.blockList = exclusionList([
  new RegExp(`${escapedRoot}/node_modules\\.(broken|bad)\\.[^/]+/.*`),
  new RegExp(`${escapedRoot}/ios/build/.*`),
  new RegExp(`${escapedRoot}/\\.tmp-[^/]+/.*`)
]);

module.exports = config;
