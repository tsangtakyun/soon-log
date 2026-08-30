const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const autolinkingTarget = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-autolinking',
  'build',
  'reactNativeConfig',
  'reactNativeConfig.js'
);

function removeMacDuplicateFiles() {
  const nodeModulesRoot = path.join(__dirname, '..', 'node_modules');

  if (!fs.existsSync(nodeModulesRoot)) {
    return;
  }

  let removed = 0;
  const duplicatePattern = / 2(\.[^/]+)?$/;

  function walk(currentPath) {
    if (!fs.existsSync(currentPath)) {
      return;
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (duplicatePattern.test(entry.name)) {
        fs.rmSync(entryPath, { recursive: true, force: true });
        removed += 1;
        continue;
      }

      if (entry.isDirectory()) {
        walk(entryPath);
      }
    }
  }

  walk(nodeModulesRoot);

  if (removed > 0) {
    console.log(`Removed ${removed} macOS duplicate node_modules entries`);
  }
}

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

function patchExpoIosBinaryPath() {
  const xcodeBuild = path.join(
    __dirname,
    '..',
    'node_modules',
    '@expo',
    'cli',
    'build',
    'src',
    'run',
    'ios',
    'XcodeBuild.js'
  );

  if (!fs.existsSync(xcodeBuild)) {
    return;
  }

  const source = fs.readFileSync(xcodeBuild, 'utf8');

  if (source.includes('SOON-LOG ShareExtension binary path fix')) {
    return;
  }

  const original = `        const binaryPath = _path().default.join(// Use the shortest defined env variable (usually there's just one).
        CONFIGURATION_BUILD_DIR[0], // Use the last defined env variable.
        UNLOCALIZED_RESOURCES_FOLDER_PATH[UNLOCALIZED_RESOURCES_FOLDER_PATH.length - 1]);
        // If the app has a space in the name it'll fail because it isn't escaped properly by Xcode.
        return getEscapedPath(binaryPath);`;

  const patched = `        // SOON-LOG ShareExtension binary path fix:
        // Expo CLI can pick a share extension resource folder (ShareExtension.app)
        // from xcodebuild environment output even though the real extension product
        // is an .appex. Prefer an existing .app product so simulator launch targets
        // SOONLOG.app instead of a non-existent ShareExtension.app.
        const appResourceFolders = UNLOCALIZED_RESOURCES_FOLDER_PATH.filter((folder)=>folder.endsWith('.app'));
        const resourceFolders = appResourceFolders.length ? appResourceFolders : UNLOCALIZED_RESOURCES_FOLDER_PATH;
        const binaryPath = resourceFolders.flatMap((folder)=>CONFIGURATION_BUILD_DIR.map((dir)=>_path().default.join(dir, folder))).find((candidate)=>_fs().default.existsSync(candidate)) || _path().default.join(CONFIGURATION_BUILD_DIR[0], resourceFolders[resourceFolders.length - 1]);
        // If the app has a space in the name it'll fail because it isn't escaped properly by Xcode.
        return getEscapedPath(binaryPath);`;

  if (!source.includes(original)) {
    console.warn('expo iOS binary path patch skipped: expected source not found');
    return;
  }

  fs.writeFileSync(xcodeBuild, source.replace(original, patched));
  console.log('Patched Expo CLI iOS app binary path selection');
}

function patchExpoIosEstimatedBinaryPath() {
  const xcodeBuild = path.join(
    __dirname,
    '..',
    'node_modules',
    '@expo',
    'cli',
    'build',
    'src',
    'run',
    'ios',
    'XcodeBuild.js'
  );

  if (!fs.existsSync(xcodeBuild)) {
    return;
  }

  const source = fs.readFileSync(xcodeBuild, 'utf8');

  if (source.includes('SOON-LOG ShareExtension estimated path fix')) {
    return;
  }

  const original = `function matchEstimatedBinaryPath(buildOutput) {
    // Match the full path that contains \`/(.*)/Developer/Xcode/DerivedData/(.*)/Build/Products/(.*)/(.*).app\`
    const appBinaryPathMatch = buildOutput.match(/(\\/(?:\\\\\\s|[^ ])+\\/Developer\\/Xcode\\/DerivedData\\/(?:\\\\\\s|[^ ])+\\/Build\\/Products\\/(?:Debug|Release)-(?:[^\\s/]+)\\/(?:\\\\\\s|[^ ])+\\.app)/);
    if (!(appBinaryPathMatch == null ? void 0 : appBinaryPathMatch.length)) {
        throw new _errors.CommandError('XCODE_BUILD', \`Malformed xcodebuild results: app binary path was not generated in build output. Report this issue and run your project with Xcode instead.\`);
    } else {
        // Sort for the shortest
        const shortestPath = appBinaryPathMatch.filter((a)=>typeof a === 'string' && a).sort((a, b)=>a.length - b.length)[0].trim();
        _log.debug(\`Found app binary path: \${shortestPath}\`);
        return shortestPath;
    }
}`;

  const patched = `function matchEstimatedBinaryPath(buildOutput) {
    // SOON-LOG ShareExtension estimated path fix:
    // Avoid matching the ".app" prefix inside ".appex" extension bundles.
    const appBinaryPathMatch = [
        ...buildOutput.matchAll(/(\\/(?:\\\\\\s|[^ ])+\\/Developer\\/Xcode\\/DerivedData\\/(?:\\\\\\s|[^ ])+\\/Build\\/Products\\/(?:Debug|Release)-(?:[^\\s/]+)\\/(?:\\\\\\s|[^ ])+\\.app)(?!e)/g)
    ].map((match)=>match[1]).filter(Boolean);
    const existingAppPath = appBinaryPathMatch.find((candidate)=>_fs().default.existsSync(candidate));
    if (existingAppPath) {
        _log.debug(\`Found existing app binary path: \${existingAppPath}\`);
        return existingAppPath;
    }
    if (!appBinaryPathMatch.length) {
        throw new _errors.CommandError('XCODE_BUILD', \`Malformed xcodebuild results: app binary path was not generated in build output. Report this issue and run your project with Xcode instead.\`);
    } else {
        const shortestPath = appBinaryPathMatch.sort((a, b)=>a.length - b.length)[0].trim();
        _log.debug(\`Found app binary path: \${shortestPath}\`);
        return shortestPath;
    }
}`;

  if (!source.includes(original)) {
    console.warn('expo iOS estimated binary path patch skipped: expected source not found');
    return;
  }

  fs.writeFileSync(xcodeBuild, source.replace(original, patched));
  console.log('Patched Expo CLI estimated iOS app binary path selection');
}

function patchReactNativeMapsGoogleManager() {
  const googleMapManager = path.join(
    __dirname,
    '..',
    'node_modules',
    'react-native-maps',
    'ios',
    'AirGoogleMaps',
    'AIRGoogleMapManager.m'
  );

  if (!fs.existsSync(googleMapManager)) {
    return;
  }

  const source = fs.readFileSync(googleMapManager, 'utf8');

  if (!source.startsWith('x//')) {
    return;
  }

  fs.writeFileSync(googleMapManager, source.replace(/^x\/\//, '//'));
  console.log('Patched react-native-maps AIRGoogleMapManager rogue prefix');
}

function patchExpoImageLoaderReactImport() {
  const imageLoaderHeader = path.join(
    __dirname,
    '..',
    'node_modules',
    'expo-image-loader',
    'ios',
    'EXImageLoader',
    'EXImageLoader.h'
  );

  if (!fs.existsSync(imageLoaderHeader)) {
    return;
  }

  const source = fs.readFileSync(imageLoaderHeader, 'utf8');

  if (source.includes('@import React;')) {
    return;
  }

  const original = `#import <ExpoModulesCore/EXInternalModule.h>
#import <ExpoModulesCore/EXImageLoaderInterface.h>
#import <React/RCTBridgeModule.h>`;

  const patched = `@import React;

#import <ExpoModulesCore/EXInternalModule.h>
#import <ExpoModulesCore/EXImageLoaderInterface.h>
#import <React/RCTBridgeModule.h>`;

  if (!source.includes(original)) {
    console.warn('expo-image-loader React import patch skipped: expected source not found');
    return;
  }

  fs.writeFileSync(imageLoaderHeader, source.replace(original, patched));
  console.log('Patched expo-image-loader React module import');
}

function patchExpoRouterRootUrlScheme() {
  const linkingFile = path.join(
    __dirname,
    '..',
    'node_modules',
    'expo-router',
    'build',
    'link',
    'linking.js'
  );

  if (!fs.existsSync(linkingFile)) {
    return;
  }

  const source = fs.readFileSync(linkingFile, 'utf8');

  if (source.includes("Linking.createURL('/', { scheme: 'soonlog' })")) {
    return;
  }

  const original = `_rootURL = Linking.createURL('/');`;
  const patched = `_rootURL = Linking.createURL('/', { scheme: 'soonlog' });`;

  if (!source.includes(original)) {
    console.warn('expo-router root URL scheme patch skipped: expected source not found');
    return;
  }

  fs.writeFileSync(linkingFile, source.replace(original, patched));
  console.log('Patched expo-router root URL scheme');
}

function patchExpoLinkingManifestFallback() {
  const schemesFile = path.join(
    __dirname,
    '..',
    'node_modules',
    'expo-linking',
    'build',
    'Schemes.js'
  );

  if (!fs.existsSync(schemesFile)) {
    return;
  }

  const source = fs.readFileSync(schemesFile, 'utf8');

  if (source.includes('SOON-LOG manifest fallback scheme')) {
    return;
  }

  const original = `export function resolveScheme(options) {
    if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
        !hasConstantsManifest()) {
        throw new Error(\`expo-linking needs access to the expo-constants manifest (app.json or app.config.js) to determine what URI scheme to use. Setup the manifest and rebuild: https://github.com/expo/expo/blob/main/packages/expo-constants/README.md\`);
    }`;

  const patched = `export function resolveScheme(options) {
    if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
        !hasConstantsManifest()) {
        // SOON-LOG manifest fallback scheme:
        // Development builds can briefly expose an empty expo-constants manifest
        // while still having the native URL scheme embedded in Info.plist.
        return options.scheme || 'soonlog';
    }`;

  if (!source.includes(original)) {
    console.warn('expo-linking manifest fallback patch skipped: expected source not found');
    return;
  }

  fs.writeFileSync(schemesFile, source.replace(original, patched));
  console.log('Patched expo-linking manifest fallback scheme');
}

function patchExpoShareIntentWebUrls() {
  const utilsFile = path.join(
    __dirname,
    '..',
    'node_modules',
    'expo-share-intent',
    'build',
    'utils.js'
  );

  if (!fs.existsSync(utilsFile)) {
    return;
  }

  const source = fs.readFileSync(utilsFile, 'utf8');

  if (source.includes('SOON-LOG preserve all iOS weburls')) {
    return;
  }

  const original = `    else if (shareIntent?.weburls?.length) {
        const weburl = shareIntent.weburls[0];
        result = {
            ...SHAREINTENT_DEFAULTVALUE,
            type: "weburl",
            text: weburl.url, // retrocompatibility
            webUrl: weburl.url,
            meta: parseJson(weburl.meta, {}),
        };
    }`;

  const patched = `    else if (shareIntent?.weburls?.length) {
        const weburls = shareIntent.weburls.map((weburl) => ({
            url: weburl.url,
            meta: parseJson(weburl.meta, {}),
        }));
        const weburl = weburls[0];
        result = {
            ...SHAREINTENT_DEFAULTVALUE,
            type: "weburl",
            text: weburl.url, // retrocompatibility
            webUrl: weburl.url,
            meta: {
                ...weburl.meta,
                // SOON-LOG preserve all iOS weburls:
                // The stock parser keeps only the first URL. We need the full
                // batch so Instagram shares can save multiple ideas at once.
                soonWebUrls: JSON.stringify(weburls),
            },
        };
    }`;

  if (!source.includes(original)) {
    console.warn('expo-share-intent weburls patch skipped: expected source not found');
    return;
  }

  fs.writeFileSync(utilsFile, source.replace(original, patched));
  console.log('Patched expo-share-intent iOS weburls batch parsing');
}

function patchExpoShareIntentSafeDecoding() {
  const moduleFile = path.join(
    __dirname,
    '..',
    'node_modules',
    'expo-share-intent',
    'ios',
    'ExpoShareIntentModule.swift'
  );

  if (!fs.existsSync(moduleFile)) {
    return;
  }

  let source = fs.readFileSync(moduleFile, 'utf8');
  const replacements = [
    [
      `        let encodedData = try? JSONDecoder().decode([SharedMediaFile].self, from: data)\n        return encodedData!`,
      `        return (try? JSONDecoder().decode([SharedMediaFile].self, from: data)) ?? []`
    ],
    [
      `        let encodedData = try? JSONDecoder().decode([WebUrl].self, from: data)\n        return encodedData!`,
      `        return (try? JSONDecoder().decode([WebUrl].self, from: data)) ?? []`
    ],
    [
      `        let encodedData = try? JSONEncoder().encode(data)\n        let json = String(data: encodedData!, encoding: .utf8)!\n        return json`,
      `        guard let encodedData = try? JSONEncoder().encode(data) else { return nil }\n        return String(data: encodedData, encoding: .utf8)`
    ]
  ];

  let changed = false;
  for (const [original, patched] of replacements) {
    if (source.includes(original)) {
      source = source.replace(original, patched);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(moduleFile, source);
    console.log('Patched expo-share-intent iOS decoding to avoid malformed-payload crashes');
  }
}

function patchReactNativeScreensMissingIosFiles() {
  const screensRoot = path.join(
    __dirname,
    '..',
    'node_modules',
    'react-native-screens'
  );
  const screensDir = path.join(screensRoot, 'ios');

  if (!fs.existsSync(screensDir)) {
    return;
  }

  const missingFiles = [
    'ios/RNSScreen.h',
    'ios/RNSModule.h',
    'ios/RNSPercentDrivenInteractiveTransition.mm',
    'ios/RNSScreenStackHeaderSubview.mm',
  ].filter((relativePath) => !fs.existsSync(path.join(screensRoot, relativePath)));

  if (missingFiles.length === 0) {
    return;
  }

  const pkg = require(path.join(screensRoot, 'package.json'));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soon-rnscreens-'));

  try {
    const packedName = execFileSync(
      'npm',
      ['pack', `react-native-screens@${pkg.version}`, '--silent', '--pack-destination', tmpDir],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
      .trim()
      .split('\n')
      .pop();
    const tarballPath = path.join(tmpDir, packedName);

    for (const relativePath of missingFiles) {
      const destination = path.join(screensRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const fileContents = execFileSync('tar', ['-xOf', tarballPath, `package/${relativePath}`]);
      fs.writeFileSync(destination, fileContents);
    }

    console.log(`Patched react-native-screens missing iOS files: ${missingFiles.join(', ')}`);
  } catch (error) {
    console.warn(
      `react-native-screens missing iOS files patch skipped: ${error.message || String(error)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

removeMacDuplicateFiles();
patchExpoAutolinking();
patchExpoDevMenuSwiftImport();
patchExpoDevMenuAppInfo();
patchExpoIosBinaryPath();
patchExpoIosEstimatedBinaryPath();
patchReactNativeMapsGoogleManager();
patchExpoImageLoaderReactImport();
patchExpoRouterRootUrlScheme();
patchExpoLinkingManifestFallback();
patchExpoShareIntentWebUrls();
patchExpoShareIntentSafeDecoding();
patchReactNativeScreensMissingIosFiles();
