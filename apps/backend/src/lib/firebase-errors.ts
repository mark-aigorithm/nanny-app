/**
 * Reading the `code` off an error the Firebase Admin SDK threw. Kept apart from
 * `lib/firebase.ts` on purpose: unit tests `jest.mock` that module wholesale,
 * and a helper living there would vanish with it.
 */

/** The Firebase error code (`auth/...`) on `err`, or undefined when it has none. */
export function firebaseErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Whether `err` is Firebase saying the account does not exist. */
export function isUserNotFound(err: unknown): boolean {
  return firebaseErrorCode(err) === 'auth/user-not-found';
}
