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
 *
 * Pass `phoneNumber` for an account about to call `/auth/register`: the app
 * links the verified phone before it registers, and the backend refuses any
 * number the ID token's `phone_number` claim doesn't carry.
 */
export async function createEmulatorUser(
  email: string,
  password: string = TEST_PASSWORD,
  phoneNumber?: string,
): Promise<string> {
  const user = await firebaseAuth.createUser({
    email,
    password,
    ...(phoneNumber ? { phoneNumber } : {}),
  });
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
 * Exchanges a Firebase custom token — the kind `firebaseAuth.createCustomToken`
 * mints — for a real ID token, the same way the mobile client's
 * `signInWithCustomToken` does. `POST /auth/email` now returns one of these
 * because swapping the Firebase email revokes every existing session for that
 * uid; a caller that keeps making authenticated requests after that gate must
 * exchange it for a fresh token instead of reusing the one it went in with.
 */
export async function exchangeCustomToken(customToken: string): Promise<string> {
  const response = await fetch(
    `${IDENTITY_TOOLKIT}/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );

  const body = (await response.json()) as { idToken?: string; error?: { message?: string } };

  if (!body.idToken) {
    throw new Error(
      `Exchanging the custom token failed: ${body.error?.message ?? response.status}. ` +
        'Is the Auth emulator running (pnpm test:emulator)?',
    );
  }

  return body.idToken;
}

/**
 * Signs in with Google against the emulator and returns a usable ID token.
 *
 * The Auth emulator accepts an unsigned JSON claim set in place of a real
 * Google ID token and creates the account on first use — exactly the state the
 * app is in after `signInWithCredential(GoogleAuthProvider.credential(...))`
 * for someone new: a Firebase user holding Google's address, and no row.
 *
 * Pass `phoneNumber` for the state step 3 of the social wizard leaves behind:
 * the verified phone linked onto that Google account, and a fresh ID token
 * carrying it (the app calls `getIdToken(true)` after linking).
 */
export async function signInWithGoogleAs(
  email: string,
  { emailVerified = true, phoneNumber }: { emailVerified?: boolean; phoneNumber?: string } = {},
): Promise<string> {
  const idToken = await googleIdpSignIn(email, emailVerified);
  if (!phoneNumber) return idToken;

  const { uid } = await firebaseAuth.verifyIdToken(idToken);
  await firebaseAuth.updateUser(uid, { phoneNumber });
  // A new sign-in mints a token that carries the phone just linked.
  return googleIdpSignIn(email, emailVerified);
}

/**
 * What Forgot password → "Email me a reset link" does, end to end: Firebase
 * mails an out-of-band code, the user opens it and picks a password. The
 * emulator mails nothing and lists the codes it issued instead.
 */
export async function resetPasswordByEmailLink(email: string, newPassword: string): Promise<void> {
  const send = await fetch(`${IDENTITY_TOOLKIT}/accounts:sendOobCode?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
  });
  if (!send.ok) throw new Error(`sendOobCode failed for ${email}: ${send.status}`);

  const listed = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const { oobCodes } = (await listed.json()) as {
    oobCodes: { email: string; requestType: string; oobCode: string }[];
  };
  // Last one wins: the emulator appends, and only the newest code is live.
  const code = [...oobCodes]
    .reverse()
    .find((c) => c.email === email && c.requestType === 'PASSWORD_RESET');
  if (!code) throw new Error(`No password-reset code issued for ${email}`);

  const reset = await fetch(`${IDENTITY_TOOLKIT}/accounts:resetPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code.oobCode, newPassword }),
  });
  if (!reset.ok) throw new Error(`resetPassword failed for ${email}: ${reset.status}`);
}

/**
 * What Forgot password → "Text me a code instead" does once the code has
 * signed her in: RNFB's `updatePassword` is exactly this `accounts:update`.
 */
export async function setPasswordWithIdToken(idToken: string, newPassword: string): Promise<void> {
  const response = await fetch(`${IDENTITY_TOOLKIT}/accounts:update?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, password: newPassword, returnSecureToken: true }),
  });
  if (!response.ok) {
    throw new Error(`accounts:update failed: ${response.status} ${await response.text()}`);
  }
}

async function googleIdpSignIn(email: string, emailVerified: boolean): Promise<string> {
  const claims = JSON.stringify({ sub: `google-${email}`, email, email_verified: emailVerified });
  const response = await fetch(`${IDENTITY_TOOLKIT}/accounts:signInWithIdp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(claims)}&providerId=google.com`,
      requestUri: 'http://localhost',
      returnSecureToken: true,
      returnIdpCredential: true,
    }),
  });

  const body = (await response.json()) as { idToken?: string; error?: { message?: string } };

  if (!body.idToken) {
    throw new Error(
      `Emulator Google sign-in failed for ${email}: ${body.error?.message ?? response.status}. ` +
        'Is the Auth emulator running (pnpm test:emulator)?',
    );
  }

  return body.idToken;
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
