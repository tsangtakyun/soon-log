const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);
const escapedRoot = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'src', moduleName.slice(2)),
      platform
    );
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.blockList = exclusionList([
  new RegExp(`${escapedRoot}/node_modules\\.(broken|bad)\\.[^/]+/.*`),
  new RegExp(`${escapedRoot}/node_modules/.*\\s\\d+/.*`),
  new RegExp(`${escapedRoot}/ios/build/.*`),
  new RegExp(`${escapedRoot}/ios/Pods\\s\\d+/.*`),
  new RegExp(`${escapedRoot}/\\.tmp-[^/]+/.*`),
  new RegExp(`${escapedRoot}/\\.env(?:\\s.*|\\..*)?$`)
]);

module.exports = config;
