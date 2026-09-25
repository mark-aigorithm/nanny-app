# Branded password-reset email — design

**Date:** 2026-09-25
**Status:** approved in chat, awaiting spec review

## Problem

Since the sign-in rework, "Forgot password" calls `auth().sendPasswordResetEmail`
(`apps/mobile/src/hooks/useAuth.ts`), so the email is sent by Firebase from its default
template: plain text, "noreply@nanny-now-d8518.firebaseapp.com", no brand. Every other email we
send (receipt, email-verification code) uses our in-repo Handlebars templates.

It is the only Firebase-sent email that reaches users: email verification is our own code email,
and the email move uses Admin `updateUser`, which sends nothing.

## Constraint

Firebase takes no template per request — `sendPasswordResetEmail` accepts only the address,
ActionCodeSettings and a language. The template is project configuration
(`notification.sendEmail.resetPasswordTemplate`), writable through the Identity Toolkit admin API
as well as the console. So the template lives in the repo and a script pushes it to the project.
No mobile change and no new build: installed apps pick it up the moment it is pushed.

## Brand

The product name in email is **Nanny Now** (matches the Firebase project and the admin console).
This renames "NannyApp" in the shared layout and in the receipt and verification subjects too.

## Design

### Templates — `apps/backend/src/lib/email/`

- `templates/password-reset.html` — body in the verification email's style: "Reset your password"
  heading, "We got a request to reset the password for `%EMAIL%`", a sage (`#97a591`) bulletproof
  **Reset password** button to `%LINK%`, the raw link as a fallback line, and an "If you didn't ask
  for this, ignore this email — your password stays the same" note. `%LINK%` / `%EMAIL%` are
  Firebase's placeholders, written literally in the file; Handlebars passes them through.
- `templates/layout.html` — the footer line becomes `{{footerNote}}` (today it says "automated
  receipt" on every email, including the verification code). Brand text → Nanny Now.
- `render.ts`
  - Each `TEMPLATES` entry gains a `footerNote`; `renderEmail` passes it to the layout.
  - New `renderFirebaseTemplate('PASSWORD_RESET')` → `{ subject, html }`, using the same layout
    and loader. Kept apart from `renderEmail` because `EmailTemplate` is also a Prisma enum for
    our send log, and Firebase-sent mail never enters that log — so no migration.

### Sync — `apps/backend/src/lib/email/firebase-templates.ts` + CLI

- `buildResetPasswordTemplateConfig()` → the `notification.sendEmail.resetPasswordTemplate`
  payload: `senderDisplayName: 'Nanny Now'`, `subject: 'Reset your Nanny Now password'`,
  `body` (rendered HTML), `bodyFormat: 'HTML'`. Sender address and reply-to are left as they are.
- `pushResetPasswordTemplate({ projectId, accessToken, fetch })` — `GET` the current config
  (print what it replaces), then
  `PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/{projectId}/config?updateMask=notification.sendEmail.resetPasswordTemplate`.
  A non-2xx response throws with the API's error message.
- `scripts/sync-firebase-email-templates.ts`, run as
  `pnpm --filter=@nanny-app/backend email:sync-firebase`: gets an access token from the backend's
  service-account credential (`admin.credential.cert(...).getAccessToken()`), targets
  `config.firebase.projectId` (the live project when run with `backend/.env`), and prints it
  before writing. `--dry-run` writes the rendered HTML to `dist/firebase-templates/` for a
  browser preview and calls nothing.
- Refuses to run when `FIREBASE_AUTH_EMULATOR_HOST` is set — the emulator ignores templates, and
  the flag means the credentials aren't real.

### Tests (unit, no network)

- `email-render.test.ts`: reset HTML keeps `%LINK%` (button and fallback) and `%EMAIL%`, has no
  leftover `{{`, sits in the layout; each template's footer shows its own line (no "receipt" on
  the verification or reset email); brand assertions move to Nanny Now.
- `firebase-templates.test.ts`: with a mocked `fetch`, the PATCH hits the right URL and
  `updateMask`, the body carries `bodyFormat: 'HTML'` and the rendered HTML, and a 4xx throws.

### Rollout

1. Merge; run `email:sync-firebase --dry-run`, eyeball the HTML.
2. Run `email:sync-firebase` against the live project; trigger "Forgot password" and check the
   received email in Gmail (web + mobile).

## Out of scope (postponed)

- Custom sender domain (needs DNS verification in the console).
- Branded page for setting the new password — the link still opens Firebase's hosted
  `/__/auth/action` page.
- Opening the app from the link (Universal / App Links: needs a domain, `associatedDomains` +
  `intentFilters`, and a new binary).
- Backend-sent reset via `generatePasswordResetLink`.
