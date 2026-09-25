/**
 * Who the mobile E2E lab signs in as.
 *
 * One place, imported by the runner and passed to the backend's seeding script,
 * so a flow and the row behind it can never disagree.
 *
 * The `+2011` prefix keeps these clear of the backend factories, which mint
 * `+2010…` numbers — `users.phone` is unique, and the E2E database is not
 * truncated between runs.
 *
 * The seeded Firebase credential is now each account's real address: the app
 * links a mother's or nanny's own email at registration, so the lab does the
 * same rather than deriving one from the phone number.
 */

/** The country code the sign-in screen is fixed to. */
const COUNTRY_CODE = '+20';

/** Shared by every seeded account; Firebase requires at least six characters. */
export const PASSWORD = 'E2ePassw0rd!';

export const ACCOUNTS = {
  mother: {
    phone: '+201100000001',
    email: 'e2e-mother@nannyapp.test',
    password: PASSWORD,
    role: 'MOTHER',
    firstName: 'Mona',
  },
  nanny: {
    phone: '+201100000002',
    email: 'e2e-nanny@nannyapp.test',
    password: PASSWORD,
    role: 'NANNY',
    firstName: 'Nadia',
  },
  /**
   * A mother who has never uploaded an ID, for A11. Separate from the one every
   * other flow signs in as, because that one has to stay past the gate — a
   * single account cannot be on both sides of it.
   */
  gatedMother: {
    phone: '+201100000003',
    email: 'e2e-gated-mother@nannyapp.test',
    password: PASSWORD,
    role: 'MOTHER',
    firstName: 'Gada',
    approvalStatus: 'PENDING_ID',
  },
  /**
   * A nanny who has submitted her ID and is waiting to be vetted, for A10.
   * `approvalStatus` is what the root router gates a nanny on — PENDING_REVIEW
   * holds her on the waiting screen, APPROVED lets her in.
   */
  pendingNanny: {
    phone: '+201100000004',
    email: 'e2e-pending-nanny@nannyapp.test',
    password: PASSWORD,
    role: 'NANNY',
    firstName: 'Noha',
    approvalStatus: 'PENDING_REVIEW',
  },
  /**
   * The account C17 deletes. Seeded fresh every run like every other entry
   * above — unlike a registration throwaway (`REGISTRATION`, `LEFTOVER`, …),
   * this one does not need `E2E_MOBILE_WIPE`: deleting it scrambles its email,
   * phone and Firebase uid (`scrambleIdentity`, account-deletion.service.ts)
   * and hard-deletes the Firebase user, so the previous run's row is already
   * invisible to `seedAccount`'s upsert-by-email and its phone is already
   * free. A run that never reaches deletion just leaves an ordinary MOTHER
   * row behind, which the upsert finds and resets like any other account.
   */
  deletable: {
    phone: '+201100000010',
    email: 'e2e-delete-me@nannyapp.test',
    password: PASSWORD,
    role: 'MOTHER',
    firstName: 'Dina',
  },
};

/**
 * The mother the full-registration flow (C2, with C7 riding on it) creates from
 * scratch, with the lab's PASSWORD. Deliberately NOT in ACCOUNTS — the flow
 * registers it, so run.mjs has the seeder **wipe** it (delete the Firebase user
 * and free the unique phone) before each run rather than upsert it, or the
 * second run collides on `users.phone`.
 */
export const REGISTRATION = {
  phone: '+201100000005',
  // Registration proves a real address for both roles, so a mother types this
  // one on step 1 and confirms the code mailed to it on step 2 — same as the
  // nanny below. It is fixed here so the email-otp advance step can find the
  // message; it becomes both `users.email` and her Firebase credential.
  email: 'e2e-mother-reg@nannyapp.test',
  firstName: 'Rana',
};

/**
 * The account the full **nanny** registration flow (A10) creates from scratch.
 * Same throwaway contract as REGISTRATION, and the same mid-wizard email proof;
 * she differs only in the extra steps (ID, professional details) after it.
 */
export const REGISTRATION_NANNY = {
  phone: '+201100000006',
  email: 'e2e-nanny-reg@nannyapp.test',
  firstName: 'Rasha',
};

/**
 * The mother C11 signs up with Google through the E2E Google picker (lib/socialAuth):
 * the picker hands the Auth emulator an unsigned Google identity for `email`,
 * so no real Google account is involved. Throwaway like REGISTRATION — the
 * seeder wipes it, by email and phone, before each run.
 */
export const SOCIAL_REGISTRATION = {
  phone: '+201100000007',
  email: 'e2e-google-reg@nannyapp.test',
};

/**
 * The Google identity C12 signs up with before finding that the seeded
 * mother's phone is taken. It never gets a row; the seeder deletes any
 * Google-only Firebase account a crashed run left under this address, and
 * unlinks it from the mother, where the previous run connected it.
 */
export const SOCIAL_COLLISION = {
  email: 'e2e-google-collide@nannyapp.test',
};

/**
 * The Google sign-up C13 drives for a nanny — same throwaway contract as
 * SOCIAL_REGISTRATION, wiped by phone + email before each run, but signing up
 * as NANNY so the wizard's ID and professional-details steps come along too.
 */
export const SOCIAL_NANNY_REGISTRATION = {
  phone: '+201100000008',
  email: 'e2e-google-nanny@nannyapp.test',
  role: 'NANNY',
};

/**
 * C14's collision: a Google sign-*in* (not sign-up) with the email of an
 * account that already has a password — the "email door" collision, as
 * opposed to C12's phone-typed collision inside the wizard. Not a separate
 * seeded identity: it is simply the seeded mother's own address, since what
 * makes the collision fire is Firebase finding her existing password
 * credential under that email. `ensureFirebaseUser` (seed-mobile.ts) already
 * strips any `google.com` provider off every seeded account on each run — the
 * same cleanup C12 depends on to reach its own collision — so there is
 * nothing extra to wipe here.
 */
export const EMAIL_DOOR_COLLISION = {
  email: ACCOUNTS.mother.email,
};

/**
 * C15's "leftover": a Firebase account with no `users` row at all — a
 * phone-first sign-up that stopped after Firebase created the account (and
 * she set a password and it linked her phone) but before `/auth/register`
 * ever ran. The seeder wipes her by phone + email, then creates a *fresh*
 * Firebase user under `E2E_MOBILE_LEFTOVERS` with the phone and password
 * already on it and `emailVerified: false` — the exact shape `useRootGate`
 * resumes into "Finish setting up your account" rather than routing her
 * anywhere else. `firstName` is not written to Firebase (a leftover has no
 * `displayName`); it is only what the flow types into Step 1's name field.
 */
export const LEFTOVER = {
  phone: '+201100000009',
  email: 'e2e-leftover@nannyapp.test',
  password: PASSWORD,
  firstName: 'Lina',
};

/**
 * The console account the lab approves with.
 *
 * A superuser rather than a scoped operator: what these flows care about is the
 * approval landing, and which sections an operator may reach is A12's subject
 * and is driven far more thoroughly by the admin suite.
 */
export const ADMIN = {
  email: 'e2e-mobile-lab@nannyapp.test',
  password: 'E2eLabAdm1n!',
};

/**
 * The digits a person actually types: the sign-in screen renders the country
 * code separately and prepends it, so a flow must not type it.
 */
export function localDigits(phoneE164) {
  return phoneE164.startsWith(COUNTRY_CODE) ? phoneE164.slice(COUNTRY_CODE.length) : phoneE164;
}
