# Registration: early email/phone availability check — design

**Date:** 2026-09-17
**Surface:** mobile registration wizard (step 1), backend auth API, shared schemas

## Problem

A person signing up learns that their email or phone already belongs to an account far too
late:

- **Email** is refused on step 2, when the OTP send fires as the screen opens. They are looking
  at a six-box code entry with a red "already exists" banner and no field to correct.
- **Phone** is refused only inside `POST /auth/register`, the very last call of the wizard —
  after they have filled every step, uploaded ID images and confirmed an SMS code.

Both should be caught on step 1, when Continue is tapped, while the fields are still on screen.

## Decision

Add one public endpoint, `POST /auth/availability`, that reports whether an email and a phone
are already taken. Step 1 calls it after local validation and before navigating; a taken
field gets an inline error under it. The lookup is the same one `registerUser` performs, moved
into a shared helper, so step 1 and the final step can never disagree.

### Rejected alternatives

- **Move the email OTP send to step 1 and reuse its 409.** Covers email only, leaves phone for
  the end, and mails a code before the user has reached the code screen.
- **Also query Firebase `getUserByPhoneNumber`.** Wrong: a Firebase phone user with no DB row is
  the legitimate "retry an abandoned wizard" case (`confirmPhone` succeeded, `registerProfile`
  failed). `registerUser` is idempotent on that uid on purpose. The DB row is the source of
  truth for "taken".

## Shared (`packages/shared/src/auth.ts`)

- Extract the E.164 regex currently inline in `RegisterRequestSchema.phone` into an exported
  `PhoneE164Schema`; `RegisterRequestSchema` uses it.
- `CheckAvailabilitySchema = z.object({ email: EmailSchema, phone: PhoneE164Schema })` and
  `CheckAvailabilityRequest`.
- `AvailabilityResponseSchema = z.object({ emailTaken: z.boolean(), phoneTaken: z.boolean() })`
  and `AvailabilityResponse`.

## Backend

### `auth.service.ts`

- New internal `findIdentityOwners(email, phone): Promise<AvailabilityResponse>` — two
  `prisma.user.findUnique` lookups (`{ email }`, `{ phone }`), run in parallel. **No
  `deletedAt` filter**, deliberately: `users.email` and `users.phone` are unique columns, so a
  soft-deleted row that still carries the value will make the insert fail. The check must
  report what the insert will do. (Rows freed by the E2E `wipeAccount` have their unique
  columns mangled, so they do not collide.)
- Exported `checkAvailability(body: CheckAvailabilityRequest)` returns
  `findIdentityOwners(body.email, body.phone)`.
- `registerUser` replaces its two inline collision lookups with one `findIdentityOwners` call
  and keeps throwing the same 409s (`'An account with this email already exists.'` first, then
  the phone message). Behaviour is unchanged; the rule now lives in one place.

### `auth.routes.ts`

```
POST /auth/availability      no auth, validateBody(CheckAvailabilitySchema)
→ 200 { data: { emailTaken, phoneTaken } }
```

No auth, for the same reason as `/auth/email/otp`: the caller has no account yet.

### Security note

This is an account-enumeration oracle for phone numbers; email already is one via
`/auth/email/otp` (409 on a taken address). There is no per-IP rate limiter yet (FOUND-05, the
Redis-backed middleware). This design accepts the same posture as the existing email endpoint
and does not add a limiter; when FOUND-05 lands, this route should be in its scope.

## Mobile

### `hooks/useAuth.ts`

`useCheckAvailability()` — `useMutation<AvailabilityResponse, Error, CheckAvailabilityRequest>`
posting to `/auth/availability` and returning `res.data.data`.

### `RegistrationStep1Screen.tsx`

- Two new pieces of state: `emailError` and `phoneError` (`string | null`).
- `handleContinue` becomes async. After the existing local checks pass (photo, names, phone
  format, email format, DOB), it calls the mutation with
  `{ email: draft.email.trim().toLowerCase(), phone: toE164(draft.countryCode, draft.phone) }`.
  - `emailTaken` → `emailError = 'An account with this email already exists.'`
  - `phoneTaken` → `phoneError = 'An account with this phone number already exists.'`
  - Both can be set from one response. If either is set, stay on the screen.
  - Neither → `router.push('/(auth)/register-email')` as today.
  - Request failure (network, 5xx, timeout) → `formError` via
    `getApiErrorMessage(err, 'Could not check your details. Please try again.')` and stay.
    Fail-closed: the next screen's OTP send needs the same connectivity, so letting them
    through would only move the failure one screen later.
- The Email `TextInputField` receives `error={emailError}` (existing prop — red border and
  message). Editing the field clears `emailError`.
- The phone row is a raw `TextInput`; a `phoneError` `Text` is rendered under `phoneRow` using a
  new `phoneErrorText` style built from `colors.error` and `typeScale`, matching the
  `TextInputField` error line. Editing the phone clears `phoneError`. Copy is the backend's own
  wording so the two surfaces read the same.
- While the mutation is pending the Continue button reads "Checking…" and is disabled.
- `formError` is also reset at the start of `handleContinue`, as now.

## Tests

### Backend unit — `src/__tests__/auth-availability.test.ts`

`prisma.user.findUnique` mocked, as in `auth-register-nanny-profile.test.ts`.

- both free → `{ emailTaken: false, phoneTaken: false }`
- email taken only → `{ emailTaken: true, phoneTaken: false }`
- phone taken only → the mirror
- both taken → both true
- `registerUser` with a taken email throws 409 with the email message; with a taken phone (and
  free email) throws 409 with the phone message — proves the shared helper still gates
  registration.

`auth-register-nanny-profile.test.ts` keeps passing unchanged: it already mocks
`user.findUnique`, which is all the helper calls.

### Mobile — `src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`

RNTL, mocking `@mobile/lib/api` the way `VerifyEmailScreen.test.tsx` does, with a filled draft.

- both free → `router.push` called with `/(auth)/register-email`
- `emailTaken` → error text under Email, no navigation
- `phoneTaken` → error text under Phone, no navigation
- request rejects → the form error text, no navigation
- editing the email after a taken response clears its error

### Integration — `src/__integration__/journeys/a10-nanny-onboarding.test.ts`

One added step: `POST /auth/availability` with the seeded mother's phone and a fresh email
asserts `{ emailTaken: false, phoneTaken: true }`; with two fresh values asserts both false.
Runs only when the test stack is up.

## Out of scope

- A "Sign in instead" shortcut on the error (asked; declined — inline error only).
- Rate limiting the new route (FOUND-05).
- Changing the `deletedAt` semantics of the collision check.
