/**
 * Who the mobile E2E lab signs in as.
 *
 * One place, imported by the runner and passed to the backend's seeding script,
 * so a flow and the row behind it can never disagree.
 *
 * The `+2011` prefix keeps these clear of the backend factories, which mint
 * `+2010…` numbers — `users.phone` is unique, and the E2E database is not
 * truncated between runs.
 */

/** The country code the sign-in screen is fixed to. */
export const COUNTRY_CODE = '+20';

/** Shared by every seeded account; Firebase requires at least six characters. */
export const PASSWORD = 'E2ePassw0rd!';

export const ACCOUNTS = {
  mother: { phone: '+201100000001', password: PASSWORD, role: 'MOTHER', firstName: 'Mona' },
  nanny: { phone: '+201100000002', password: PASSWORD, role: 'NANNY', firstName: 'Nadia' },
};

/**
 * The digits a person actually types: the sign-in screen renders the country
 * code separately and prepends it, so a flow must not type it.
 */
export function localDigits(phoneE164) {
  return phoneE164.startsWith(COUNTRY_CODE) ? phoneE164.slice(COUNTRY_CODE.length) : phoneE164;
}

/**
 * The Firebase credential the app derives from a phone number.
 *
 * Sign-up is phone-only, so there is no real email anywhere — the app
 * synthesizes one (`phoneToPlaceholderEmail` in src/lib/validation.ts) and the
 * backend's seeder derives the same string. `scripts/advance.js` needs it to
 * sign in over HTTP as the same person the flow is signed in as on the device.
 */
export function placeholderEmail(phoneE164) {
  return `${phoneE164.replace(/\D/g, '')}@phone.nannyapp.local`;
}
