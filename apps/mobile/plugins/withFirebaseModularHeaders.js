const { withDangerousMod } = require('@expo/config-plugins');
const generateCode = require('@expo/config-plugins/build/utils/generateCode');
const fs = require('fs');
const path = require('path');

/**
 * Makes `pod install` succeed with React Native Firebase.
 *
 * Firebase's Swift pods (FirebaseAuth, FirebaseCoreInternal) depend on pods
 * that don't define modules, and CocoaPods refuses to integrate them as static
 * libraries: "The Swift pod `FirebaseAuth` depends upon ... which do not define
 * modules."
 *
 * CocoaPods offers two ways out. Global `use_frameworks!` is the better-known
 * one, but it breaks react-native-maps, which imports React headers that aren't
 * modular — inside a framework module that becomes a hard error
 * (-Wnon-modular-include-in-framework-module, escalated by -Werror).
 *
 * So take the narrower option instead: turn on modular headers for exactly the
 * pods named in the error, leaving every other pod's linkage untouched.
 */
const PODS_NEEDING_MODULAR_HEADERS = [
  'GoogleUtilities',
  'FirebaseAuthInterop',
  'FirebaseAppCheckInterop',
  'RecaptchaInterop',
];

const withFirebaseModularHeaders = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfile, 'utf-8');

      const newSrc = PODS_NEEDING_MODULAR_HEADERS.map(
        (pod) => `  pod '${pod}', :modular_headers => true`,
      ).join('\n');

      const result = generateCode.mergeContents({
        tag: 'withFirebaseModularHeaders',
        src: contents,
        newSrc,
        anchor: /use_expo_modules!/,
        offset: 1,
        comment: '  #',
      });

      fs.writeFileSync(podfile, result.contents);
      return cfg;
    },
  ]);

module.exports = withFirebaseModularHeaders;
