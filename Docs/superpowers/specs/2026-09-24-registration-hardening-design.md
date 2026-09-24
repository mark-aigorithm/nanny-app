# Registration hardening, and sign-in as the front door

**Status:** Approved 2026-09-24. Delivered as four stacked plans (below); all four have landed.
Still to write: the E2E flows C13–C15 (plan 3) and C17 (plan 4) — no such flow files exist yet.
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
| A Google/Apple user wants a password | The email screen shows a hint pointing to Forgot password → "Text me a code instead", which adds a password and keeps Google/Apple. No wizard step. (Revised 2026-09-24 after A28 showed the email-link reset unlinks Google/Apple.) |
| Account deletion | Included: `DELETE /auth/me` plus a "Delete account" button. |
| Leftover accounts | **Resume + reclaim**, with no background job. Signing in to a leftover resumes sign-up. Proving the email (our OTP) reclaims a leftover holding it. |
| Minimum age | 18 for both roles, enforced in the shared schema and the date picker. |
| Mother's step-1 photo | Uploaded and saved as `avatarUrl`. |

## Design choices (approved with the plan)

- **Deletion refusals:** deletion is refused while a booking is active (409 "Finish or cancel your upcoming bookings before deleting your account."). Staff get 403.
- **One endpoint, two meanings:** `DELETE /auth/me` with no body only discards an unfinished sign-up — it deletes the Firebase user when no `users` row points at the uid, and answers 409 when one does. Only `{ confirm: 'delete-my-account' }` deletes a real account. A row already soft-deleted is refused (409) either way.
- **Where the button is:** "Delete account" on the mother's account screen, the nanny's profile editor, and the upload-ID and pending-review screens (`useConfirmDeleteAccount`).
- **Immediate deletion:**
  - Soft-delete the row, and scramble its email, phone and uid so they can be reused.
  - Set `deletionRequestedAt`.
  - Delete the Firebase user.
  - A PII purge is out of scope.
- **Apple revocation** runs on iOS: `auth().revokeToken(code)`, before the account is deleted. Android users with Apple linked are deleted anyway and the event is logged. Server-side revocation needs an Apple key that isn't set up; it's a follow-up.
- **Phone changes:** phone is removed from `PATCH /auth/me` (changing a number is a later feature).
- **`checkRevoked`** stays off `/auth/email`. Its lost-response recovery relies on revoked tokens still passing.
- **Draft storage:** the registration draft stays in memory. Resume covers the Firebase side after the app is killed.
- **Deleting accounts:** the server deletes only accounts it confirms have no row. So "Use a different sign-up method" deletes the account that sign-up created, and collision B deletes whichever providers are linked. This replaces the social-auth spec's rule that only collision B may delete. (Collision B still deletes client-side first — guarded on the draft's `signUpUid` — and asks the server only when Firebase wants a recent sign-in.)
- **Reclaiming an email:** `POST /auth/reclaim-email` lets a row-less sign-up that has just proven an address (our OTP token) delete another row-less, enabled Firebase account holding it. A disabled holder, one with any row, or an address a live row holds gets 409.
- **Orphaned rows:** `/auth/me` (and the other `auth.service` reads of the caller's row) re-attaches a live mother/nanny row to a new uid when the token proves its phone or verified email, exactly one row matches, and its old Firebase user is gone.

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
9. **"Continue as guest"** link, which calls `enterGuestMode()` and then `dismissTo('/(parent)/home')` (a guest who reached sign-in from `RegisterPromptModal`, pushed from `(parent)`, pops back instead of stacking a second `(parent)`; on a cold start it behaves like `replace`). It is hidden while a pending link banner shows.

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
- The email screen shows: "Signed up with Google or Apple? Go back and use that button, or tap Forgot password and choose "Text me a code instead" to add a password."
- Forgot password's channel choice adds: "Signed up with Google or Apple? Choose "Text me a code instead": it adds a password and keeps your Google or Apple sign-in."
- Forgot password's email channel (while `!emailSent`) additionally shows: "Signed up with Google or Apple? This link disconnects it. Use "Text me a code instead"." — the email-link reset unlinks every federated provider (A28), so this channel gets its own warning rather than relying on the channel-choice hint alone.
- Emulator-proven (integration A28):
  - `accounts:update {password}` on a Google+phone account (what RNFB `updatePassword` sends after the SMS reset) adds `password` and keeps `google.com` and `phone`.
  - The email-link reset (`accounts:resetPassword`) adds `password` but **unlinks every federated provider** (Firebase's anti-hijack rule; the emulator does it deliberately in `resetPassword`). The phone and uid survive. That is why the hints steer Google/Apple users to the SMS reset. The email link stays available; after it, "Continue with Google" relinks automatically for Gmail, or through collision A otherwise.

**E2E:**
- Flows start at "Welcome to NannyNow". Sign-up goes via "Sign up"; sign-in via "Sign in with email".
- C11 gains a tail (the C16 case): sign out, see the hint, reset by SMS, set a password, sign out, then sign in by email.

## Out of scope

- Server-side Apple token revocation.
- Setting the email on a re-attached row's new Firebase account (plan 3 follow-up; changing it revokes sessions).
- A PII purge after deletion.
- Persisting the draft across app kills.
