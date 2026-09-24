/**
 * A28 — a Google or Apple sign-up can get a password.
 *
 * Nothing in the wizard asks a Google/Apple user for one, so the email door
 * points them at Forgot password. The SMS reset really does leave a password
 * on the *same* Firebase account without disturbing the social sign-in — but
 * the email-link reset unlinks it, which is why the app steers a Google/Apple
 * user to the SMS channel. The emulator runs the real identitytoolkit logic,
 * so a pass here is Firebase's behaviour, not ours.
 */
import { firebaseAuth } from '@backend/lib/firebase';

import {
  resetPasswordByEmailLink,
  setPasswordWithIdToken,
  signInAs,
  signInWithGoogleAs,
} from '../../../test/auth';

const NEW_PASSWORD = 'chosen-later-123';

function uniqueEmail(): string {
  return `google-pw-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

async function providersOf(email: string): Promise<string[]> {
  const user = await firebaseAuth.getUserByEmail(email);
  return user.providerData.map((p) => p.providerId);
}

describe('A28 — a password for a Google account', () => {
  it('the email reset link adds a password but disconnects Google', async () => {
    // Firebase's email-link reset unlinks every federated provider (the
    // emulator's `resetPassword` does it deliberately, mirroring Firebase's
    // anti-hijack rule), which is why the app steers Google/Apple users to
    // the SMS reset instead.
    const email = uniqueEmail();
    const phone = `+2011${String(Date.now()).slice(-8)}`;
    const googleToken = await signInWithGoogleAs(email, { phoneNumber: phone });
    const { uid } = await firebaseAuth.verifyIdToken(googleToken);

    await resetPasswordByEmailLink(email, NEW_PASSWORD);

    const providers = await providersOf(email);
    expect(providers).toEqual(expect.arrayContaining(['password', 'phone']));
    expect(providers).not.toContain('google.com');
    const passwordToken = await signInAs(email, NEW_PASSWORD);
    expect((await firebaseAuth.verifyIdToken(passwordToken)).uid).toBe(uid);
  });

  it('the SMS reset adds a password to a Google account with a phone', async () => {
    const email = uniqueEmail();
    const phone = `+2011${String(Date.now()).slice(-8)}`;
    const googleToken = await signInWithGoogleAs(email, { phoneNumber: phone });
    const { uid } = await firebaseAuth.verifyIdToken(googleToken);

    await setPasswordWithIdToken(googleToken, NEW_PASSWORD);

    expect(await providersOf(email)).toEqual(
      expect.arrayContaining(['google.com', 'phone', 'password']),
    );
    const passwordToken = await signInAs(email, NEW_PASSWORD);
    expect((await firebaseAuth.verifyIdToken(passwordToken)).uid).toBe(uid);
  });
});
