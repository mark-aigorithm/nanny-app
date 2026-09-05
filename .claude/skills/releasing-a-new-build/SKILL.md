---
name: releasing-a-new-build
description: Use when shipping a new NannyApp build to testers — a TestFlight submission, an installable Android APK link, an EAS build of any profile, or "cut a build / send it to TestFlight / get me an APK". Also use when an EAS build fails to start, crashes at launch, or reaches TestFlight but phone sign-in falls back to reCAPTCHA.
---

# Releasing a new build

A **build**, not a version. `app.config.ts` pins `version: '1.0.0'` and `eas.json` sets
`appVersionSource: "remote"`, so EAS owns the build number and `autoIncrement` on the production
profile bumps it server-side. **Never edit `version` to ship to testers** — a new build number is
what TestFlight and Play need, and the marketing version only changes when the product does.

## Preflight

| Check | Why |
|---|---|
| `git push` first | EAS archives the **committed** git state, not your working tree. Uncommitted work is silently absent from the build. Pushes need `gh auth switch -u mark-aigorithm`. |
| `node -e "console.log(require('typescript/package.json').version)"` | eas-cli dies loading the config on **typescript 7.x** with `Cannot read properties of undefined (reading 'CommonJS')`. Force-install `typescript@5.5.4` if it's 7. |
| Backend env vars on the deployment the app points at | The app talks to the Vercel backend (`API_BASE_URL` in `app.config.ts`). Server config degrades **silently**: no `GMAIL_*`/`SMTP_*` ⇒ every email OTP 400s, no `PAYMOB_*` ⇒ checkout is dead. Check before handing testers a build that exercises them. |
| `npx eas-cli whoami` | Non-interactive builds fail late without a session. |

## The two commands

```bash
# iOS → TestFlight. ascAppId is already in eas.json, so this needs no prompts.
npx eas-cli build --platform ios --profile production --auto-submit --non-interactive
```
```bash
# Android → an installable APK with a shareable expo.dev link.
npx eas-cli build --platform android --profile preview --non-interactive
```

**Use `preview` for the APK, not `production`.** The production profile has no
`android.buildType`, so it builds an **.aab** — a Play upload artifact, not something a tester can
install from a link. `preview` and `development` both set `buildType: "apk"`; `development` also
bundles the dev-client (needs Metro), so `preview` is the one to hand out.

Each build takes ~15–30 min. Run them with `run_in_background: true` and poll the log — the URL is
printed early (`https://expo.dev/accounts/markbotros0/projects/nanny-app/builds/<id>`) and the
artifact link at the end.

## Traps that have actually broken a build

- **iOS phone auth silently falls back to reCAPTCHA** unless Firebase → Cloud Messaging holds the
  APNs `.p8` in the **production** auth-key slot. A TestFlight build uses the production APNs
  environment; a key registered only as Development leaves Firebase with nothing to send the silent
  verification push. The fallback is a dead end here — the scheme is `nanny-app` and the plist has
  no `REVERSED_CLIENT_ID`. Console-only fix, no rebuild.
- **`src/lib/firebase.ts` must keep the JS-SDK `initializeApp`.** This app is a Firebase *hybrid*:
  native `@react-native-firebase` for auth + messaging, JS SDK for Storage. Dropping the JS init
  makes `getStorage(getApp())` throw `app/no-app` during module eval, which on iOS 26 becomes a
  **fatal launch crash** whose `.ips` masks the cause. Reproduce iOS-only crashes on the Android
  dev-client, where the same throw prints plainly.
- **Push entitlements come from `app.config.ts`**, not the messaging plugin —
  `ios.entitlements['aps-environment']` and `ios.infoPlist.UIBackgroundModes`. Without them the
  verification push can't arrive.
- **The Maps key is baked at `prebuild` time.** Changing `GOOGLE_MAPS_API_KEY` does nothing to an
  already-built binary, and flipping it on for a Metro-served debug APK crashes `MapView` natively.

## After it lands

TestFlight processing takes a few minutes after submit; the build appears under the ascAppId
`6797044436` app. Verify a real device reaches **SMS entry with no reCAPTCHA** — that is the signal
the APNs production key is still right. For the APK, hand over the artifact URL from the build page.

The device-level detail behind these (emulator, Maestro, the Firebase console state) lives in the
`mobile-e2e-lab` skill and the `phone-auth-verification` memory.
