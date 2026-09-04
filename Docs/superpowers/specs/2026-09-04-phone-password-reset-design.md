# Phone-based password reset — design

**Date:** 2026-09-04
**Status:** approved

## Problem

Sign-in is phone-only (phone + password; the Firebase credential is a phone-derived
**placeholder** email + password). The current `ForgotPasswordScreen` calls
`sendPasswordResetEmail(email)` — which, for a real user, would send to the fake placeholder
address that has no inbox. Password reset is therefore effectively broken. It must be driven by
the phone number, the actual sign-in identity.

## Approach

Rework `ForgotPasswordScreen` into a single screen with two phases (no new routes or stores;
the Firebase `confirmation` object is a live handle, so it stays in local state rather than
crossing a router-param boundary).

- **Phase 1 — Phone:** country-code + phone input (same control/validation as `SignInScreen`).
  "Send code" → `useSendPhoneOtp` → `auth().signInWithPhoneNumber(phoneE164)`. On success, store
  the confirmation in local state and advance to phase 2. Errors via `mapFirebaseAuthError`.
- **Phase 2 — Verify & set new password:** reuse `OtpCodeInput` and the password-requirements
  checklist pattern from `CreatePasswordScreen`, plus a resend cooldown (`RESEND_SECONDS`,
  mirroring `RegistrationStep3Screen`). "Reset password" → `confirmation.confirm(code)` (this
  signs the user in as the phone uid) → `currentUser.updatePassword(newPassword)` (updates the
  password on the linked email/password provider that Sign In checks).

**After success:** the user is already authenticated (OTP), so `router.replace('/')` — the root
gate routes them into the app by role. (Matches how registration ends.)

## Code changes

- **`hooks/useAuth.ts`**
  - Add `useConfirmPhoneAndResetPassword({ confirmation, code, newPassword })`: `confirm(code)`
    then `currentUser.updatePassword(newPassword)`; map errors with `mapFirebaseAuthError`.
  - Remove `useForgotPassword` (email reset) — its only consumer is this screen.
- **`screens/auth/ForgotPasswordScreen.tsx`** — reworked to the two-phase phone flow above.
  Reuses `OtpCodeInput`, `TextInputField`, `Button`; password rules mirror `CreatePasswordScreen`
  (≥8 chars, uppercase, number, match). Phone helpers `toE164` from `@mobile/lib/validation`.
- **`screens/auth/styles/forgot-password-screen.styles.ts`** — extend for the phone row, OTP,
  password fields, and requirements list, all from `@mobile/theme` tokens.

## Errors / edges

- Invalid or expired code, weak password, and anti-abuse throttling surface inline (same handling
  as registration).
- A number with no account: `signInWithPhoneNumber` creates a phone-only Firebase user →
  `updatePassword` may fail without a password provider; the error surfaces inline, and if it
  signs in as an orphan session the root gate already routes such sessions. Not specially handled
  in v1 (YAGNI).

## Testing / delivery

- `tsc --noEmit` + `jest` (the firebase module is mocked; add coverage for the new hook if it fits
  the existing `useAuth` test patterns).
- **JS-only change** → shippable as an EAS Update (OTA) to build #6 if EAS Update is configured;
  otherwise it rides the next native build.

## Out of scope

Email-based reset, account-existence pre-check, and any change to the phone-only identity model.
