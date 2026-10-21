---
name: releasing-a-new-build
description: Use when shipping a new NannyApp build to testers — a TestFlight submission, an installable Android APK link, an EAS build of any profile, or "cut a build / send it to TestFlight / get me an APK". Also use when an EAS build fails to start, crashes at launch, or reaches TestFlight but phone sign-in falls back to reCAPTCHA.
---

# Releasing a new build

A **build**, not a version. `app.config.ts` pins `version` (currently `1.0.1`) and `eas.json` sets
`appVersionSource: "remote"`, so EAS owns the build number and `autoIncrement` on the production
and preview profiles bumps it server-side (one counter per platform, shared by both profiles; a
build attempt that fails after the bump still uses its number up). **Never edit `version` to ship to testers** — a new build number is
what TestFlight and Play need. The marketing `version` changes only for a public store release (see the
store-release note under Preflight), because the force-update check compares it.

## Preflight

| Check | Why |
|---|---|
| `git push` first | EAS archives the **committed** git state, not your working tree. Uncommitted work is silently absent from the build. Pushes need `gh auth switch -u mark-aigorithm`. |
| `node -e "console.log(require('typescript/package.json').version)"` | eas-cli dies loading the config on **typescript 7.x** with `Cannot read properties of undefined (reading 'CommonJS')`. Force-install `typescript@5.5.4` if it's 7. |
| Backend env vars on the deployment the app points at | The app talks to the Vercel backend (`API_BASE_URL` in `app.config.ts`). Server config degrades **silently**: no `GMAIL_*`/`SMTP_*` ⇒ every email OTP 400s, no `PAYMOB_*` ⇒ checkout is dead. Check before handing testers a build that exercises them. |
| `EXPO_TOKEN=$(cat ~/.secrets/expo-token-nanny-app) npx eas-cli whoami` | Non-interactive builds fail late without auth. Every eas-cli command authenticates with this token file (never print it), not the `~/.expo` login session. `~/.secrets` also holds other projects' tokens; use only this one. |

For a **store release** (not a tester build), also:

- **Bump `version` in `apps/mobile/app.config.ts`** (semver x.y.z) for every store release. The
  force-update check compares this version; two builds with the same version are indistinguishable to it.

## The two commands

Each runs in its own detached tmux session with a log, per the workspace rule for long commands.
Tell the user the session name and log path.

```bash
# iOS → TestFlight. ascAppId is already in eas.json, so this needs no prompts.
tmux new -d -s nanny-app-ios-build "cd /home/mark/projects/nanny-app/apps/mobile && EXPO_TOKEN=\$(cat ~/.secrets/expo-token-nanny-app) npx eas-cli build --platform ios --profile production --auto-submit --non-interactive 2>&1 | tee ~/logs/nanny-app-ios-build.log"
```
```bash
# Android → an installable APK with a shareable expo.dev link.
tmux new -d -s nanny-app-android-build "cd /home/mark/projects/nanny-app/apps/mobile && EXPO_TOKEN=\$(cat ~/.secrets/expo-token-nanny-app) npx eas-cli build --platform android --profile preview --non-interactive 2>&1 | tee ~/logs/nanny-app-android-build.log"
```

**Use `preview` for the APK, not `production`.** The production profile has no
`android.buildType`, so it builds an **.aab** — a Play upload artifact, not something a tester can
install from a link. `preview` and `development` both set `buildType: "apk"`; `development` also
bundles the dev-client (needs Metro), so `preview` is the one to hand out.

Each build takes ~15–30 min. The URL is printed early in the log
(`https://expo.dev/accounts/markbotros.aigorithm/projects/nanny-app/builds/<id>`); wait for the end
with a background loop on `EXPO_TOKEN=… npx eas-cli build:view <id> --json` until `status` is
`FINISHED`/`ERRORED`, which also carries the artifact link.

**A new signed target needs one interactive run.** The token covers Expo, not Apple: when a build
adds a bundle id (the `NotificationService` extension did), `--non-interactive` stops at "Failed to
set up credentials". Have the user run the iOS command without `--non-interactive` and without tmux
(`! cd apps/mobile && npx eas-cli build --platform ios --profile production --auto-submit`), log in
to Apple, reuse the existing distribution certificate and let EAS generate the new profile. Later
builds are non-interactive again.

## Traps that have actually broken a build

- **iOS phone auth silently falls back to reCAPTCHA** unless Firebase → Cloud Messaging holds the
  APNs `.p8` in the **production** auth-key slot. A TestFlight build uses the production APNs
  environment; a key registered only as Development leaves Firebase with nothing to send the silent
  verification push. The fallback is a dead end here — the scheme is `nanny-app` and the plist has
  no `REVERSED_CLIENT_ID`. Console-only fix, no rebuild.
- **Firebase is all-native now — the JS SDK is not a mobile dependency.** This used to be a
  *hybrid* (native `@react-native-firebase` for auth + messaging, JS SDK for Storage), and the rule
  here used to be "never drop the JS-SDK `initializeApp`", because `getStorage(getApp())` would then
  throw `app/no-app` during module eval and become a **fatal iOS launch crash** whose `.ips` masks
  the cause. That hybrid was itself the bug: the two SDKs hold separate sessions, so every upload
  went out unauthenticated and the bucket returned `storage/unauthorized`. Storage moved to
  `@react-native-firebase/storage` (2026-09-09) and the JS SDK was removed from `apps/mobile`
  entirely. Nothing should call `initializeApp` or import `firebase/*` in the mobile app again.
  The module-eval hazard still applies in general: reproduce iOS-only launch crashes on the Android
  dev-client, where the same throw prints plainly.
- **Adding a `@react-native-firebase/*` package means editing `plugins/withIosFirebasePods.js`.**
  Its `rnfb_targets` array is hardcoded, and each listed pod gets `DEFINES_MODULE = 'NO'` — which is
  what makes RNFB's direct `<React/...>` imports legal under framework linkage. A pod missing from
  that array fails the **iOS build** (`'RCTPromiseRejectBlock' must be imported from module
  'RNFBApp.RNFBAppModule'`), ~20 minutes in, with nothing wrong in the JS. Android autolinks and
  needs no equivalent.
- **Push entitlements come from `app.config.ts`**, not the messaging plugin —
  `ios.entitlements['aps-environment']` and `ios.infoPlist.UIBackgroundModes`. Without them the
  verification push can't arrive.
- **The Maps key is baked at `prebuild` time.** Changing `GOOGLE_MAPS_API_KEY` does nothing to an
  already-built binary, and flipping it on for a Metro-served debug APK crashes `MapView` natively.

## After it lands

TestFlight processing takes a few minutes after submit; the build appears under the ascAppId
`6797044436` app. Verify a real device reaches **SMS entry with no reCAPTCHA** — that is the signal
the APNs production key is still right. For the APK, hand over the artifact URL from the build page.

- **Record the release** in the admin console → App Releases (platform + version) once the store has
  published it. Tick *Mandatory* only when every older install must stop working — and only after the
  build is live on that platform's store.

The device-level detail behind these (emulator, Maestro, the Firebase console state) lives in the
`mobile-e2e-lab` skill and the `phone-auth-verification` memory.
