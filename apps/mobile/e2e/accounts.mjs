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
export const COUNTRY_CODE = '+20';

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
};

/**
 * The account a full-registration flow (Phase 3 of the coverage-expansion spec)
 * creates from scratch. Deliberately NOT in ACCOUNTS — the flow registers it, so
 * the seeder must **wipe** it (delete the Firebase user and free the unique
 * phone) before each run rather than upsert it, or the second run collides on
 * `users.phone`. Wiring the runner passthrough + the seeder wipe is Phase 2c.
 * See Docs/testing/2026-09-04-e2e-coverage-expansion-design.md.
 */
export const REGISTRATION = {
  phone: '+201100000005',
  // Registration proves a real address for both roles, so a mother types this
  // one on step 1 and confirms the code mailed to it on step 2 — same as the
  // nanny below. It is fixed here so the email-otp advance step can find the
  // message; `users.email` ends up holding it, not the phone placeholder.
  email: 'e2e-mother-reg@nannyapp.test',
  password: PASSWORD,
  role: 'MOTHER',
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
  password: PASSWORD,
  role: 'NANNY',
  firstName: 'Rasha',
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
