const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Adds a Notification Service Extension to the iOS app, so announcement pushes
 * show their image on iPhones as they already do on Android.
 *
 * iOS shows a push's text by itself. To show a picture, an extension inside
 * the app has to download it and attach it before the banner appears. The
 * backend marks a push that has an image `mutable-content` and FCM puts the
 * URL in `fcm_options.image` (notification.service.ts); the Swift in
 * notification-service/ does the rest. It uses no pods, so it needs no entry
 * in withIosFirebasePods.
 *
 * The extension is its own app inside the app: it has its own bundle id
 * (<app>.NotificationService), which EAS signs because app.config.ts lists it
 * under extra.eas.build.experimental.ios.appExtensions. Like every native
 * change, it reaches phones only in a new build.
 */
const TARGET = 'NotificationService';
const SOURCES = ['NotificationService.swift'];
const DEPLOYMENT_TARGET = '15.1';

function infoPlist(version, buildNumber) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${TARGET}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${buildNumber}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
</dict>
</plist>
`;
}

/** Copies the Swift source and writes the extension's Info.plist into ios/NotificationService. */
const withExtensionFiles = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dir, { recursive: true });
      for (const file of SOURCES) {
        fs.copyFileSync(path.join(__dirname, 'notification-service', file), path.join(dir, file));
      }
      fs.writeFileSync(
        path.join(dir, `${TARGET}-Info.plist`),
        infoPlist(cfg.version ?? '1.0.0', cfg.ios?.buildNumber ?? '1'),
      );
      return cfg;
    },
  ]);

/** Adds the extension target, its sources and build settings, and embeds it in the app. */
const withExtensionTarget = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    if (project.pbxTargetByName(TARGET)) return cfg;

    const bundleId = `${cfg.ios.bundleIdentifier}.${TARGET}`;
    // The `xcode` package assumes these sections exist when it wires the new
    // target into the app; a fresh Expo project doesn't have them yet.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    const group = project.addPbxGroup([...SOURCES, `${TARGET}-Info.plist`], TARGET, TARGET);
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group.uuid, mainGroup);

    // app_extension also adds the "Embed App Extensions" phase and the
    // dependency on the app target.
    const target = project.addTarget(TARGET, 'app_extension', TARGET, bundleId);
    project.addBuildPhase(SOURCES, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    // addTarget appends the embed phase after the app's script phases, which
    // Xcode 15+ can reject as "Cycle inside NannyNow". Embed right after
    // Resources instead.
    const appPhases = project.getFirstTarget().firstTarget.buildPhases;
    const copyPhases = project.hash.project.objects.PBXCopyFilesBuildPhase || {};
    const embedAt = appPhases.findIndex((p) => copyPhases[p.value]?.dstSubfolderSpec === 13);
    const resourcesAt = appPhases.findIndex((p) => p.comment === 'Resources');
    if (embedAt > resourcesAt + 1 && resourcesAt >= 0) {
      const [embed] = appPhases.splice(embedAt, 1);
      appPhases.splice(resourcesAt + 1, 0, embed);
    }

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      const settings = configurations[key].buildSettings;
      if (!settings || settings.PRODUCT_NAME !== `"${TARGET}"`) continue;
      Object.assign(settings, {
        CLANG_ENABLE_MODULES: 'YES',
        CODE_SIGN_STYLE: 'Automatic',
        INFOPLIST_FILE: `${TARGET}/${TARGET}-Info.plist`,
        IPHONEOS_DEPLOYMENT_TARGET: DEPLOYMENT_TARGET,
        PRODUCT_BUNDLE_IDENTIFIER: bundleId,
        SKIP_INSTALL: 'YES',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '"1,2"',
      });
    }
    return cfg;
  });

module.exports = (config) => withExtensionTarget(withExtensionFiles(config));
