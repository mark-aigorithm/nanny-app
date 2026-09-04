# Native Firebase Auth — design

**Date:** 2026-09-04
**Branch:** `claude/native-firebase-auth` (off `main`, backed up as `backup/main-2026-09-04-pre-native-auth`)
**Status:** approved, implementing

## Goal

Make phone authentication work for **real phone numbers** on device / TestFlight / production. Today `apps/mobile/src/lib/firebase.ts` uses the Firebase **JS SDK** with a fake reCAPTCHA verifier, which Firebase only accepts for numbers listed under *Phone numbers for testing*. A native TestFlight build does not change that on its own, because the file always uses the JS SDK regardless of runtime.

Auth is **phone-only**: the phone number is the identity. The email/password Firebase credential uses a placeholder synthesized from the phone (`phoneToPlaceholderEmail`); a user's real email is stored separately in `users.email` for receipts / Paymob only and is never a Firebase credential. This design does not change that — only the SDK backing it.

## Approach: native-only (`@react-native-firebase/auth`)

Chosen over a runtime hybrid (Expo Go JS shim + native) because the app already requires a native dev-client (VLC live-camera monitor, native FCM), so the Expo Go auth path is already a partial fiction. Native-only deletes the shim wholesale and is the true production path — matching the original file's own header instruction.

The old `auth()` shim was written to **mimic `@react-native-firebase/auth` exactly**, so swapping to the real module is a drop-in for every consumer.

### Changes

1. **Rewrite `apps/mobile/src/lib/firebase.ts`** (~240 → ~50 lines):
   - `import auth from '@react-native-firebase/auth'` and re-export it.
   - Delete the JS-SDK setup (`initializeApp`/`initializeAuth`/`getReactNativePersistence`), the `currentUser` Proxy, the fake `ApplicationVerifier`, and the `LegacyAuth` shim.
   - Config auto-loads from `google-services.json` / `GoogleService-Info.plist`; the native module persists the session itself.
   - `signInWithPhoneNumber` now does real device attestation (Play Integrity / APNs), so real numbers get a real SMS.
   - Re-export types `FirebaseUser`, `PhoneConfirmation`, `UserCredential` from `FirebaseAuthTypes`.

2. **E2E emulator wiring** — the only behavioral swap: `connectAuthEmulator(jsAuth, ...)` → native `auth().useEmulator('http://' + host)`, driven by the same `firebaseAuthEmulatorHost` extra the E2E stack already sets (`10.0.2.2:9099`), wrapped in try/catch for Fast Refresh. No E2E infra change.

3. **Delete `apps/mobile/src/lib/secureStorage.ts`** — its only consumer was the JS SDK persistence adapter; native persistence makes it dead code.

### Consumers — unchanged

`useAuth.ts`, `api.ts` (`currentUser.getIdToken()`), `authStore.ts` (`FirebaseUser` type + `onAuthStateChanged`), `RegistrationStep3Screen` (`PhoneConfirmation` type). All methods used (`currentUser`, `signInWithEmailAndPassword`, `signInWithPhoneNumber`, `onAuthStateChanged`, `linkWithCredential`, `confirm`, `EmailAuthProvider.credential`) are native-module methods.

### Tests / preview — unaffected

`jest.setup.js` mocks `@mobile/lib/firebase` entirely; `vite.preview.config.ts` stubs it. Neither exercises the native module.

## iOS real-number prerequisites (outside this code change)

- **APNs auth key must be uploaded to the Firebase Console** (Project Settings → Cloud Messaging). Without it, iOS phone auth falls back to a web reCAPTCHA. Manual step — cannot be done from the repo.
- No `REVERSED_CLIENT_ID` exists in `GoogleService-Info.plist` (no OAuth client configured), so there is no URL scheme to add and the reCAPTCHA fallback is not wired; iOS relies on the APNs path. Android needs nothing beyond `google-services.json`.

## Verification

- `tsc --noEmit` (mobile) — proves the type re-exports resolve and consumers still typecheck.
- `jest` (mobile) — unit suite; module is mocked, so it must stay green.
- Real proof (yours): a device / TestFlight build for real-number sign-in; optionally the device E2E flow (`pnpm test:e2e:mobile`) against the Auth emulator.

## Out of scope

Expo Go auth (intentionally dropped), any change to the phone-only identity model, backend, or the email-verification flow.
