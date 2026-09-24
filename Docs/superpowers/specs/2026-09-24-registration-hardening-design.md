# Registration hardening, and sign-in as the front door

**Status:** Approved 2026-09-24. Delivered as four stacked plans (below).
**Builds on:** [Google and Apple sign-in](2026-09-23-social-auth-google-apple-design.md) and [Phone-first auth](2026-09-23-phone-first-auth-firebase-reset-design.md).

## Why

The owner asked for two things:
- The app should open on **sign-in**, with:
  - phone + SMS;
  - Continue with Google, and Continue with Apple (iOS only);
  - a **Sign in with email** button;
  - **Forgot password**;
  - a **Sign up** button leading to a mother/nanny screen and then the existing wizard.
- Every registration gap should be closed.

Two read-only audits (mobile journeys; backend and test coverage) found about 25 gaps. The worst:
- **Loops on leftover accounts.** A Firebase account with no `users` row produces "You already have an account" and "Sign up first" at the same time.
- **Step 3 retry.** It re-confirms an SMS code that has already been spent.
- **Root gate.** It signs a registered user out on any `/auth/me` error.
- **`PATCH /auth/me`.** It accepts an unverified phone.
- **Deleted Firebase user.** A row whose Firebase user was deleted locks its owner out forever.
- **Register race.** Racing registrations return 500.
- **Account deletion.** There is no in-app deletion, which the App Store requires.
- **Validation.** DOB accepts a newborn; upload URLs accept any host.
- **Passwords.** A Google/Apple user has no way to get a password.

## Decisions (owner)

| Question | Decision |
|---|---|
| Splash / guest | The "Get Started" splash is removed; sign-in is the landing screen, with a small "Continue as guest" link. |
| Sign-up screen | `RoleSelectionScreen` stays as the sign-up screen and keeps its Google/Apple buttons. |
| A Google/Apple user wants a password | The email screen shows a hint. Forgot password (email link or SMS) creates the password. No wizard step. |
| Account deletion | Included: `DELETE /auth/me` plus a "Delete account" button. |
| Leftover accounts | **Resume + reclaim**, with no background job. Signing in to a leftover resumes sign-up. Proving the email (our OTP) reclaims a leftover holding it. |
| Minimum age | 18 for both roles, enforced in the shared schema and the date picker. |
| Mother's step-1 photo | Uploaded and saved as `avatarUrl`. |

## Design choices (approved with the plan)

- **Deletion refusals:** deletion is refused while a booking is active (409 "Finish or cancel your upcoming bookings before deleting your account."). Staff get 403.
- **Immediate deletion:**
  - Soft-delete the row, and scramble its email, phone and uid so they can be reused.
  - Set `deletionRequestedAt`.
  - Delete the Firebase user.
  - A PII purge is out of scope.
- **Apple revocation** runs on iOS: `auth().revokeToken(code)`, before the account is deleted. Android users with Apple linked are deleted anyway and the event is logged. Server-side revocation needs an Apple key that isn't set up; it's a follow-up.
- **Phone changes:** phone is removed from `PATCH /auth/me` (changing a number is a later feature).
- **`checkRevoked`** stays off `/auth/email`. Its lost-response recovery relies on revoked tokens still passing.
- **Draft storage:** the registration draft stays in memory. Resume covers the Firebase side after the app is killed.
- **Deleting accounts:** the server deletes only accounts it confirms have no row. So "Use a different sign-up method" deletes the account that sign-up created, and collision B deletes whichever providers are linked. This replaces the social-auth spec's rule that only collision B may delete.

## The four plans

| # | Branch | Scope |
|---|---|---|
| 1 | `feat/sign-in-landing` | Sign-in landing screen, splash removal, `dismissTo` back-navigation, password hint and Forgot-password copy, emulator proof that a reset gives a Google account a password, nanny Google sign-up integration case, E2E flow updates, and C11's password tail. |
| 2 | `feat/registration-validation` | Shared schema (DOB 18+, age-range enum, terms literal, non-empty address, `avatarUrl` required for both roles, phone off PATCH). Backend `requireFreshAuth` on `/register` and admin routes, OTP-email match, P2002 race, `emailVerified` re-sync, own-bucket URL check, mother avatar saved. Step 1 DOB picker and Step 3 photo upload for both roles. |
| 3 | `feat/registration-recovery` | Re-attach an orphaned row, `/auth/reclaim-email`, `ApiRequestError.status`, `clearLocalSession`, resume flow and root gate, door fixes (SMS / email / SMS reset), collision fixes (fresh credential), Step 3 retry/session-mismatch/409 fixes, and E2E C13–C15. |
| 4 | `feat/account-deletion` | `scrambleIdentity`, `DELETE /auth/me`, mobile `useDeleteAccount` with Apple revocation, buttons on the profile screens, and E2E C17. |

Each plan is written against the code the previous plan left, just before it runs.

## Plan 1 detail: sign-in landing

**Sign-in screen, top to bottom:**
1. Header "Welcome to NannyNow" (`APP_NAME`).
2. The existing subtitle.
3. The pending-link banner.
4. Phone field + "Send code" (code phase unchanged).
5. "or", then Google/Apple.
6. Outline button **"Sign in with email"** → `/(auth)/sign-in-email`.
7. **"Forgot password?"** link → `/(auth)/forgot-password`.
8. Divider "New to NannyNow?", then outline button **"Sign up"** → `/(auth)/role-selection`.
9. **"Continue as guest"** link, which calls `enterGuestMode()` and then `replace('/(parent)/home')`. It is hidden while a pending link banner shows.

During the code phase, items 5–9 are hidden and only the code UI shows.

**Phone prefill:** when a pending link arrives while the screen is mounted, the phone field fills from `pending.phoneHint`.

**Routing:**
- `app/index.tsx` sends signed-out, non-guest users to `/(auth)/sign-in`.
- The four sign-out exits that used `/(auth)/splash` now go to `/(auth)/sign-in`.
- The splash route, screen and styles are deleted.

**Returning to sign-in:** sign-in is now at the bottom of the auth stack. Returning to it uses `router.dismissTo('/(auth)/sign-in')`, which pops back to it, or replaces when it isn't in the stack. This applies to:
- role selection's "Sign in";
- SocialAuthButtons' sign-up `needs-link`;
- Step 1's and Step 3's collision-B exits.

**Password guidance:**
- The email screen shows: "Signed up with Google or Apple? Use that button, or tap Forgot password to create a password."
- Forgot password's channel choice adds: "Signed up with Google or Apple? This also creates a password for your account."
- Emulator-proven (integration A28): a password reset on a Google-only account, and `accounts:update {password}` (what RNFB `updatePassword` sends) on a Google+phone account, each add the `password` provider, and `signInWithPassword` then works.

**E2E:**
- Flows start at "Welcome to NannyNow". Sign-up goes via "Sign up"; sign-in via "Sign in with email".
- C11 gains a tail (the C16 case): sign out, see the hint, reset by SMS, set a password, sign out, then sign in by email.

## Out of scope

- Server-side Apple token revocation.
- Setting the email on a re-attached row's new Firebase account (plan 3 follow-up; changing it revokes sessions).
- A PII purge after deletion.
- Persisting the draft across app kills.
