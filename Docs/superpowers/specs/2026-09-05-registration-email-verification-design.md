# Email verification moves into registration

**Date:** 2026-09-05
**Status:** implemented (unit + typecheck green; integration and device tiers not yet run)

## Problem

A mother registers with a phone-derived placeholder address (`+20…@nannynow.app`) and is asked for
a real one at a pre-booking gate — a dismissable modal opened by `useEmailGate` when she taps
"Book care". Two consequences:

1. Every mother account carries a fake address until the first booking attempt, so nothing
   transactional (receipts, payment billing records, account recovery) can reach her before then.
2. The gate is a second, parallel implementation of the verification the nanny wizard already does
   properly — same endpoints, different UI, different failure handling.

The decision: collect and prove the address during registration for both roles, and delete the
gate.

## Approach

The nanny wizard already has the shape we want — step 1 collects the address,
`RegistrationNannyEmailScreen` proves it, and the resulting one-time token is spent by
`POST /auth/register` inside the registration transaction. Mothers move onto that same path; the
screen is generalised rather than duplicated.

### A. The mother wizard gains a step (4 → 5)

| # | Route | Mother | Nanny |
|---|---|---|---|
| 1 | `register-step-1` | personal info **+ Email field** | unchanged |
| 2 | `register-email` | **new for mothers** | unchanged (was `register-nanny-email`) |
| 3 | `register-create-password` | — | — |
| 4 | `register-step-2` / `register-nanny-location` | location, children, preferences | — |
| 5 | `register-step-3` | phone OTP → `POST /auth/register` | (+ id, details — still 6) |

- `RegistrationNannyEmailScreen` → `RegistrationEmailScreen`; route `/(auth)/register-nanny-email`
  → `/(auth)/register-email`. Its step label becomes role-aware.
- `RegistrationStep1Screen`: the Email field and its validation lose the `isNanny` guard; the
  mother's `STEP n OF 4` labels become `OF 5`.
- `RegistrationStep3Screen`: `profileEmail` is `draft.email` for both roles, and the
  "not verified" guard plus `emailVerificationToken` move out of the `isNanny` branch.

**`credentialEmail` is deliberately untouched.** The Firebase credential stays the phone-derived
placeholder, so sign-in remains phone-based and `SignInScreen` is unaffected. Only `users.email`
changes meaning: it is now always a real, proven address.

### B. Backend: the token is mandatory for everyone

- `RegisterRequestSchema` (`packages/shared/src/auth.ts`): `emailVerificationToken` becomes
  required; the `role !== 'NANNY'` refine is deleted.
- `registerUser`: always consumes the token inside the registration transaction, always writes
  `isEmailVerified: true` / `emailVerifiedAt`.
- `POST /auth/email` (`setVerifiedEmail`) **stays** — it is what the legacy screen below calls.

### C. Legacy accounts are blocked at launch

Accounts that already exist with a placeholder address cannot be left half-verified, so they are
forced through verification on next launch rather than at their next booking attempt.

- New `/(auth)/verify-email` screen: the same two panes as the deleted modal (address, then code),
  reusing `useVerifiedEmailSubmit` unchanged. **No "Maybe later"** — the only exit is Sign out.
- `app/index.tsx` gains one check above the role switch, applying to both roles:
  `if (profile && !profile.isEmailVerified) return <Redirect href="/(auth)/verify-email" />`.
- On success the screen invalidates `auth/me` and `router.replace('/')`, so normal routing resumes.

### D. Deleted

`useEmailGate.ts`, `emailGateStore.ts`, `EmailVerifyModal.tsx`, `EmailGatePreview.tsx`, the modal's
mount in `app/(parent)/_layout.tsx`, the `emailGate(...)` wraps in `HomeScreen` and
`ServicesHubScreen`, and `openEmailGate()` in `BookingStep1Screen`.

The ID gate (`useIdGate`, `idGateStore`, `IdVerifyModal`) is untouched.

### E. Tests

- Mobile: delete `useEmailGate.test.tsx`; `EmailVerifyModal.test.tsx` → `VerifyEmailScreen.test.tsx`;
  fix `ServicesHubScreen.test.tsx`.
- Backend: `a14-mother-email-gate.test.ts` is repurposed — mother registration is rejected without a
  token, and `POST /auth/email` still upgrades a legacy placeholder row.
- Device: `c02-mother-registration.yaml` gains the email step, reading the code from Mailpit via the
  same `ADVANCE: email-otp` hook `a10` uses; `seed-mobile.ts` seeds mothers as email-verified so the
  booking journeys don't hit the new blocker.

## Risk

Registration now hard-depends on SMTP. The deployed backend currently has no mail transport
configured (`config.email.enabled === false`), which is why the pre-booking gate fails in
TestFlight today. **The mail environment variables must be set on the deployment before this
ships**, or the failure escalates from "cannot book" to "cannot sign up".
