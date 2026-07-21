const { withDangerousMod } = require('@expo/config-plugins');
const generateCode = require('@expo/config-plugins/build/utils/generateCode');
const fs = require('fs');
const path = require('path');

/**
 * Makes the iOS build work with React Native Firebase.
 *
 * Background: modern FirebaseAuth is written in Swift, and Swift can only
 * import Objective-C pods that define modules. Several of its dependencies
 * (GoogleUtilities, RecaptchaInterop, the *Interop pods) don't, so CocoaPods
 * refuses to integrate Firebase as static libraries at all -- `pod install`
 * fails outright. The fix is framework linkage, set via expo-build-properties
 * as ios.useFrameworks='static'.
 *
 * That alone is NOT enough. React Native Firebase requires a second, separate
 * step that expo-build-properties has no option for and that the
 * @react-native-firebase/app config plugin does not apply:
 *
 *   $RNFirebaseAsStaticFramework = true
 *
 * Without it, RNFB's own pods don't resolve React/Firebase headers through the
 * framework module boundary, and the build dies on errors like
 * "'RCTPromiseRejectBlock' must be imported from module 'RNFBApp.RNFBAppModule'"
 * and "'FirebaseAuth/FirebaseAuth-Swift.h' file not found".
 * See https://rnfirebase.io/ (iOS installation) and
 * https://github.com/invertase/react-native-firebase/issues/6332
 *
 * The post_install hook additionally relaxes a header-hygiene diagnostic that
 * framework linkage turns fatal for other pods. It only downgrades a warning;
 * it doesn't change linkage or behaviour.
 */
const withIosFirebasePods = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf-8');

      // Must be a top-level global, before the target block is evaluated.
      if (!contents.includes('RNFirebaseAsStaticFramework')) {
        contents = `$RNFirebaseAsStaticFramework = true\n${contents}`;
      }

      const result = generateCode.mergeContents({
        tag: 'withIosFirebasePods',
        src: contents,
        newSrc: [
          "    rnfb_targets = ['RNFBApp', 'RNFBAuth', 'RNFBMessaging']",
          '    installer.pods_project.targets.each do |target|',
          '      target.build_configurations.each do |bc|',
          "        bc.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
          '        # fmt (via RCT-Folly) uses consteval in a way Xcode 26 clang',
          '        # rejects: "call to consteval function ... is not a constant',
          '        # expression". Only surfaces when RN is built from source,',
          '        # since the prebuilt artifacts never compile fmt.',
          "        defs = bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']",
          '        defs = [defs] unless defs.is_a?(Array)',
          "        bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs + ['FMT_USE_CONSTEVAL=0']",
          '        # RNFB headers import <React/...> directly. Keeping these',
          '        # targets out of the module system is what makes that legal.',
          '        if rnfb_targets.include?(target.name)',
          "          bc.build_settings['DEFINES_MODULE'] = 'NO'",
          '        end',
          '      end',
          '    end',
        ].join('\n'),
        anchor: /post_install do \|installer\|/,
        offset: 1,
        comment: '    #',
      });

      fs.writeFileSync(podfile, result.contents);
      return cfg;
    },
  ]);

module.exports = withIosFirebasePods;
