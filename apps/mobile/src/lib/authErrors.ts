/** Shown when the backend could not be reached or answered with neither 200 nor 404. */
export const COULD_NOT_CONNECT = "Couldn't connect. Check your connection and try again.";

export type AuthErrorField = 'email' | 'password' | 'phone' | 'form';

export type MappedAuthError = {
  field: AuthErrorField;
  message: string;
  /**
   * A machine-readable code, set only where a caller branches on it — a
   * Firebase code (e.g. `auth/credential-already-in-use` starting the
   * collision flow) or one of our own (`session-mismatch`, `account-exists`). The copy in
   * `message` stays the thing screens show.
   */
  code?: string;
};

/**
 * True for an error already mapped to copy — so a `catch` that maps everything
 * else can rethrow one of ours untouched.
 */
export function isMappedAuthError(value: unknown): value is MappedAuthError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { field?: unknown }).field === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

type FirebaseErrorShape = { code: string };

function isFirebaseError(error: unknown): error is FirebaseErrorShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/**
 * The `code` on a raw Firebase (or native SDK) error, for callers that branch
 * on a specific one before mapping it. `undefined` when there is none.
 */
export function authErrorCode(error: unknown): string | undefined {
  return isFirebaseError(error) ? error.code : undefined;
}

/** Turns a raw Firebase auth error into copy a screen can show, and the field it belongs under. */
export function mapFirebaseAuthError(error: unknown): MappedAuthError {
  // Not a Firebase error (a native crash, a network layer failure): its
  // message is for developers, never for her.
  if (!isFirebaseError(error)) {
    return { field: 'form', message: 'Something went wrong. Please try again.' };
  }

  switch (error.code) {
    case 'auth/invalid-email':
      return { field: 'email', message: "That doesn't look like a valid email address." };
    case 'auth/user-not-found':
      return { field: 'email', message: "We couldn't find an account with those details." };
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return { field: 'password', message: 'Incorrect email or password.' };
    case 'auth/email-already-in-use':
      return { field: 'email', message: 'An account with this email already exists.' };
    case 'auth/weak-password':
      return { field: 'password', message: 'Password is too weak. Use at least 8 characters.' };
    case 'auth/invalid-phone-number':
      return { field: 'phone', message: "That phone number doesn't look right." };
    case 'auth/missing-phone-number':
      return { field: 'phone', message: 'Please enter your phone number.' };
    case 'auth/quota-exceeded':
      return { field: 'phone', message: 'SMS quota exceeded. Try again later.' };
    case 'auth/invalid-verification-code':
      return { field: 'form', message: "That code isn't right. Check and try again." };
    case 'auth/code-expired':
      return { field: 'form', message: 'That code has expired. Tap resend to get a new one.' };
    case 'auth/credential-already-in-use':
      return {
        field: 'phone',
        message: 'This phone number is already linked to another account.',
      };
    case 'auth/too-many-requests':
      return { field: 'form', message: 'Too many attempts. Try again in a few minutes.' };
    case 'auth/network-request-failed':
      return {
        field: 'form',
        message: 'Network error. Check your connection and try again.',
      };
    case 'auth/account-exists-with-different-credential':
      return {
        field: 'form',
        message: 'You already have an account with this email. Sign in with your phone once to connect it.',
      };
    case 'auth/user-disabled':
      return { field: 'form', message: 'This account has been disabled. Contact support for help.' };
    default:
      return { field: 'form', message: 'Something went wrong. Please try again.' };
  }
}
