// Mirrors the requirements checklist in CreatePasswordScreen: ≥8 chars,
// at least one uppercase letter, at least one digit.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Please enter your email address.';
  if (!EMAIL_REGEX.test(trimmed)) return "That doesn't look like a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Please enter your password.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/\d/.test(password)) return 'Password must include a number.';
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
 * Synthesize a stable placeholder email from an E.164 phone number.
 *
 * Sign-up and sign-in are by phone number. Firebase's email/password provider
 * — linked onto the phone-verified account so `SignInScreen` has a credential
 * to check — still needs a unique address, so we derive a deterministic
 * placeholder from the phone digits: the same number always maps to the same
 * account.
 *
 * This is NOT the user's real email. That lives in `users.email`, is proven by
 * our own OTP, and exists so we can reach them — booking receipts and the
 * Paymob billing record. It never becomes a sign-in credential.
 */
export function phoneToPlaceholderEmail(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return `${digits}@phone.nannyapp.local`;
}
