import { dateOfBirthError } from '@nanny-app/shared';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Please enter your email address.';
  if (!EMAIL_REGEX.test(trimmed)) return "That doesn't look like a valid email address.";
  return null;
}

/**
 * The email sign-in door only checks that a password was typed — it must not
 * enforce creation-time strength rules, because a password can also be set on
 * Firebase's hosted reset page, which enforces only Firebase's own policy
 * (default: 6+ characters, no composition rule). Someone who resets to e.g.
 * "sunshine22" would otherwise never reach Firebase to find out it's already
 * accepted there.
 */
export function validateSignInPassword(password: string): string | null {
  if (!password) return 'Please enter your password.';
  return null;
}

export function validatePhone(phoneDigits: string): string | null {
  const digits = phoneDigits.replace(/\D/g, '');
  if (!digits) return 'Please enter your phone number.';
  if (digits.length < 7) return 'That phone number looks too short.';
  return null;
}

/** Build an E.164-formatted phone number from a country code (e.g. '+1') and digits. */
export function toE164(countryCode: string, phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const cc = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
  return `${cc}${digits}`;
}

/**
 * The digits a person types for `e164` next to the country-code box — the
 * reverse of `toE164`. Empty when the number is from another country code.
 */
export function fromE164(countryCode: string, e164: string | null): string {
  if (!e164) return '';
  const cc = countryCode.startsWith('+') ? countryCode : `+${countryCode}`;
  return e164.startsWith(cc) ? e164.slice(cc.length) : '';
}

/** The date picker's 'mm/dd/yyyy' as the API's 'YYYY-MM-DD'. Empty string on bad input. */
export function dobToIso(dob: string): string {
  const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * "About you"'s birth-date check — the shared rule the API enforces (18 to
 * 100, a real date), so the wizard refuses on the screen where the date can
 * still be changed, not steps later.
 */
export function validateDob(dob: string, today: Date = new Date()): string | null {
  if (!dob) return 'Please select your date of birth.';
  return dateOfBirthError(dobToIso(dob), today);
}
