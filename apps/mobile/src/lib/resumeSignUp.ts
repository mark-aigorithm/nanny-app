import type { FirebaseUser } from '@mobile/lib/firebase';
import { fromE164 } from '@mobile/lib/validation';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import type { AuthProvider, SocialProvider } from '@mobile/types';

const COUNTRY_CODE = '+20';

/** The Google/Apple identity on the account, if any. */
function socialProviderOf(user: FirebaseUser): SocialProvider | null {
  const ids = user.providerData.map((p) => p.providerId);
  if (ids.includes('google.com')) return 'google';
  if (ids.includes('apple.com')) return 'apple';
  return null;
}

/**
 * Starts a draft from the account that is already signed in, for someone
 * whose sign-up stopped after Firebase created the account but before
 * /auth/register wrote the row. What the account already proves is carried
 * and locked: a Google/Apple-verified email (the social wizard), the phone on
 * the account (the wizard skips "Your number" — `phoneOnAccountAtStart`), and
 * an existing password for the same email ("Secure your account" keeps it).
 *
 * A phone-only account with no row is resumed too: "Your number" signs in
 * before anything else, so an app killed after it relaunches here.
 *
 * `isResume` (default true) is what the root gate sets; useSocialSignIn seeds
 * a brand-new social sign-up with `isResume: false`.
 */
export function seedDraftFromAccount(user: FirebaseUser, options: { isResume?: boolean } = {}): void {
  const social = socialProviderOf(user);
  const authProvider: AuthProvider = social && user.email && user.emailVerified ? social : 'phone';
  const passwordEntry = user.providerData.find((p) => p.providerId === 'password');
  const passwordEmail = passwordEntry?.email?.trim().toLowerCase() || null;
  const [firstName = '', ...rest] = (user.displayName ?? '').trim().split(/\s+/).filter(Boolean);
  const accountPhone = user.phoneNumber || null;

  const draft = useRegistrationDraftStore.getState();
  draft.reset();
  draft.patch({
    isResume: options.isResume ?? true,
    signUpUid: user.uid,
    authProvider,
    email: (user.email ?? passwordEmail ?? '').trim().toLowerCase(),
    firstName,
    lastName: rest.join(' '),
    countryCode: COUNTRY_CODE,
    phone: fromE164(COUNTRY_CODE, accountPhone),
    accountPhone,
    phoneOnAccountAtStart: accountPhone !== null,
    passwordEmail,
  });
}
