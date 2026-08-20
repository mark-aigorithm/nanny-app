/**
 * Auth helpers backed by the Firebase Auth emulator.
 *
 * Tokens here are minted the same way a real client mints them — an actual
 * sign-in against the identitytoolkit REST API — and the backend verifies them
 * through the real `firebaseAuth.verifyIdToken` in auth.middleware.ts. Nothing
 * about the auth path is stubbed; only the issuer is local.
 */
import { firebaseAuth } from '@backend/lib/firebase';

const EMULATOR_HOST = process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? '127.0.0.1:9099';
const PROJECT_ID = process.env['FIREBASE_PROJECT_ID'] ?? 'demo-nannyapp';

/**
 * The emulator ignores the API key entirely but the endpoint still requires the
 * parameter to be present, so any non-empty value works.
 */
const IDENTITY_TOOLKIT = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
const API_KEY = 'fake-api-key';

/** Password used for every factory-created account. Length satisfies Firebase's 6-char minimum. */
export const TEST_PASSWORD = 'test-password-123';

/**
 * Creates a Firebase account in the emulator and returns its uid.
 * Mirrors what `/auth/register` relies on having already happened: the app's
 * own flow always has a Firebase user before a DB row exists.
 */
export async function createEmulatorUser(
  email: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  const user = await firebaseAuth.createUser({ email, password });
  return user.uid;
}

/**
 * Signs in and returns a usable ID token — the exact string a client would put
 * in `Authorization: Bearer …`.
 */
export async function signInAs(
  email: string,
  password: string = TEST_PASSWORD,
): Promise<string> {
  const response = await fetch(
    `${IDENTITY_TOOLKIT}/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const body = (await response.json()) as { idToken?: string; error?: { message?: string } };

  if (!body.idToken) {
    throw new Error(
      `Emulator sign-in failed for ${email}: ${body.error?.message ?? response.status}. ` +
        'Is the Auth emulator running (pnpm test:emulator)?',
    );
  }

  return body.idToken;
}

/** Convenience for supertest: `.set(...authHeader(token))`. */
export function authHeader(token: string): ['Authorization', string] {
  return ['Authorization', `Bearer ${token}`];
}

/**
 * Deletes every account in the emulator project.
 *
 * Called from the per-test reset so Firebase state cannot outlive the database
 * rows that referenced it — a stale account whose `users` row was truncated is
 * exactly the kind of half-state that produces order-dependent tests.
 */
export async function clearEmulatorUsers(): Promise<void> {
  const response = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to clear emulator accounts (HTTP ${response.status}). ` +
        'Is the Auth emulator running (pnpm test:emulator)?',
    );
  }
}
