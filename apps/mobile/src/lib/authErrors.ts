export type AuthErrorField = 'email' | 'password' | 'phone' | 'form';

export type MappedAuthError = {
  field: AuthErrorField;
  message: string;
};

type FirebaseErrorShape = { code: string };

function isFirebaseError(error: unknown): error is FirebaseErrorShape {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

export function mapFirebaseAuthError(error: unknown): MappedAuthError {
  // Log the raw error so it shows up in the Metro terminal / JS console.
  // Remove this before shipping.
  // eslint-disable-next-line no-console
  console.error('[auth] Firebase error:', error);

  if (!isFirebaseError(error)) {
    const msg =
      error instanceof Error ? error.message : String(error);
    return { field: 'form', message: `Unexpected error: ${msg}` };
  }

  switch (error.code) {
    case 'auth/invalid-email':
      return { field: 'email', message: "That doesn't look like a valid email address." };
    case 'auth/user-not-found':
      return { field: 'email', message: "We couldn't find an account with that email." };
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
    default:
      // Surface the raw code so we can see what's actually going wrong.
      // Replace with the generic message before shipping.
      return {
        field: 'form',
        message: `Auth error: ${error.code}`,
      };
  }
}
