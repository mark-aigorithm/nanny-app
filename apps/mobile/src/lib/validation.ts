// Mirrors the requirements checklist in CreatePasswordScreen: ≥8 chars,
// at least one uppercase letter, at least one digit.

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
