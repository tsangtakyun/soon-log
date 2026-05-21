const fs = require('fs');
const path = require('path');

const autolinkingTarget = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-autolinking',
  'build',
  'reactNativeConfig',
  'reactNativeConfig.js'
);

function patchExpoAutolinking() {
  if (!fs.existsSync(autolinkingTarget)) {
    return;
  }

  const source = fs.readFileSync(autolinkingTarget, 'utf8');

  if (source.includes('before loading its config')) {
    return;
  }

  const original = `async function resolveDependencyConfigAsync(platform, name, packageRoot, projectConfig) {
    const libraryConfig = await (0, config_1.loadConfigAsync)(packageRoot);`;

  const patched = `async function resolveDependencyConfigAsync(platform, name, packageRoot, projectConfig) {
    if (name === 'react-native' || name === 'react-native-macos') {
        // Starting from version 0.76, the \`react-native\` package only defines platforms
        // when @react-native-community/cli-platform-android/ios is installed.
        // Therefore, we need to manually filter it out before loading its config.
        return null;
    }
    const libraryConfig = await (0, config_1.loadConfigAsync)(packageRoot);`;

  if (!source.includes(original)) {
    console.warn('expo-modules-autolinking patch skipped: expected source not found');
    return;
  }

  const next = source
    .replace(original, patched)
    .replace(`    if (name === 'react-native' || name === 'react-native-macos') {
        // Starting from version 0.76, the \`react-native\` package only defines platforms
        // when @react-native-community/cli-platform-android/ios is installed.
        // Therefore, we need to manually filter it out.
        return null;
    }
`, '');

  fs.writeFileSync(autolinkingTarget, next);
  console.log('Patched expo-modules-autolinking react-native config resolution');
}

function patchExpoDevMenuSwiftImport() {
  const devMenuBridge = path.join(
    __dirname,
    '..',
    'node_modules',
    'expo-dev-menu',
    'ios',
    'DevMenuRCTBridge.mm'
  );

  if (!fs.existsSync(devMenuBridge)) {
    return;
  }

  const source = fs.readFileSync(devMenuBridge, 'utf8');
  const original = `#if __has_include(<EXDevMenuInterface/EXDevMenuInterface-Swift.h>)
#import <EXDevMenuInterface/EXDevMenuInterface-Swift.h>
#else
#import <EXDevMenuInterface-Swift.h>
#endif`;
  const patched = `#if __has_include(<EXDevMenuInterface/EXDevMenuInterface-Swift.h>)
#import <EXDevMenuInterface/EXDevMenuInterface-Swift.h>
#elif __has_include(<EXDevMenuInterface-Swift.h>)
#import <EXDevMenuInterface-Swift.h>
#endif`;

  if (!source.includes(original)) {
    const coreOriginal = `#if __has_include(<ExpoModulesCore/ExpoModulesCore-Swift.h>)
#import <ExpoModulesCore/ExpoModulesCore-Swift.h>
#else
#import <ExpoModulesCore-Swift.h>
#endif
#if __has_include(<EXDevMenu/EXDevMenu-Swift.h>)
#import <EXDevMenu/EXDevMenu-Swift.h>
#else
#import <EXDevMenu-Swift.h>
#endif`;
    const corePatched = `#if __has_include(<ExpoModulesCore/ExpoModulesCore-Swift.h>)
#import <ExpoModulesCore/ExpoModulesCore-Swift.h>
#elif __has_include(<ExpoModulesCore-Swift.h>)
#import <ExpoModulesCore-Swift.h>
#endif
#if __has_include(<EXDevMenu/EXDevMenu-Swift.h>)
#import <EXDevMenu/EXDevMenu-Swift.h>
#elif __has_include(<EXDevMenu-Swift.h>)
#import <EXDevMenu-Swift.h>
#endif`;

    if (source.includes(coreOriginal)) {
      fs.writeFileSync(devMenuBridge, source.replace(coreOriginal, corePatched));
      console.log('Patched expo-dev-menu optional Swift imports');
    }
    return;
  }

  const next = source.replace(original, patched);
  fs.writeFileSync(devMenuBridge, next);
  console.log('Patched expo-dev-menu optional EXDevMenuInterface Swift import');
  patchExpoDevMenuSwiftImport();
}

function patchExpoDevMenuAppInfo() {
  const appInfo = path.join(
    __dirname,
    '..',
    'node_modules',
    'expo-dev-menu',
    'ios',
    'EXDevMenuAppInfo.m'
  );

  if (!fs.existsSync(appInfo)) {
    return;
  }

  let source = fs.readFileSync(appInfo, 'utf8');
  const originalImports = `#import <EXDevMenu/EXDevMenuAppInfo.h>
#import <React/RCTBridge+Private.h>
#if __has_include(<EXDevMenu/EXDevMenu-Swift.h>)
#import <EXDevMenu/EXDevMenu-Swift.h>
#else
#import <EXDevMenu-Swift.h>
#endif

@import EXManifests;`;
  const patchedImports = `#import <EXDevMenu/EXDevMenuAppInfo.h>`;

  const originalManifestBlock = `  DevMenuManager *manager = [DevMenuManager shared];

  if (manager.currentManifest != nil) {
    appName = [manager.currentManifest name];
    appVersion = [manager.currentManifest version];

    if ([manager.currentManifest isKindOfClass:[EXManifestsExpoUpdatesManifest class]]) {
      runtimeVersion = [(EXManifestsExpoUpdatesManifest *)manager.currentManifest runtimeVersion];
    }
  }

  NSString *engine;
  NSString *bridgeDescription = [[[manager currentBridge] batchedBridge] bridgeDescription];

  // In bridgeless mode the bridgeDescription always is "BridgeProxy" instead of actual engine name
  if ([bridgeDescription containsString:@"BridgeProxy"]) {
  #if USE_HERMES
    engine = @"Hermes";
  #else
    engine = @"JSC";
  #endif
  } else if ([bridgeDescription containsString:@"Hermes"]) {
    engine = @"Hermes";
  } else if ([bridgeDescription containsString:@"V8"]) {
    engine = @"V8";
  } else {
    engine = @"JSC";
  }

  NSString *hostUrl = [manager.currentManifestURL absoluteString] ?: @"";`;
  const patchedManifestBlock = `  NSString *engine = @"JSC";
  NSString *hostUrl = @"";`;

  if (!source.includes(originalImports) || !source.includes(originalManifestBlock)) {
    return;
  }

  source = source
    .replace(originalImports, patchedImports)
    .replace(originalManifestBlock, patchedManifestBlock);

  fs.writeFileSync(appInfo, source);
  console.log('Patched expo-dev-menu app info Swift header dependency');
}

patchExpoAutolinking();
patchExpoDevMenuSwiftImport();
patchExpoDevMenuAppInfo();
