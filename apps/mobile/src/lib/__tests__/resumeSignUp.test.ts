import type { FirebaseUser } from '@mobile/lib/firebase';
import { seedDraftFromAccount } from '@mobile/lib/resumeSignUp';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

type ProviderEntry = { providerId: string; email?: string; phoneNumber?: string };

function account(overrides: {
  uid?: string;
  email?: string | null;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  displayName?: string | null;
  providerData?: ProviderEntry[];
}): FirebaseUser {
  return {
    uid: 'uid-leftover',
    email: null,
    emailVerified: false,
    phoneNumber: null,
    displayName: null,
    providerData: [],
    ...overrides,
  } as unknown as FirebaseUser;
}

beforeEach(() => {
  useRegistrationDraftStore.getState().reset();
});

it('seeds a phone+password leftover as a phone sign-up that carries what the account proves', () => {
  seedDraftFromAccount(
    account({
      phoneNumber: '+201001234567',
      providerData: [
        { providerId: 'phone', phoneNumber: '+201001234567' },
        { providerId: 'password', email: ' Mona@Example.com ' },
      ],
    }),
  );

  expect(useRegistrationDraftStore.getState()).toMatchObject({
    isResume: true,
    signUpUid: 'uid-leftover',
    authProvider: 'phone',
    // The account itself has no top-level email here; the password provider's is used.
    email: 'mona@example.com',
    countryCode: '+20',
    phone: '1001234567',
    accountPhone: '+201001234567',
    passwordEmail: 'mona@example.com',
  });
});

it('seeds a verified Google account as a Google sign-up', () => {
  seedDraftFromAccount(
    account({
      email: 'salma@gmail.com',
      emailVerified: true,
      providerData: [{ providerId: 'google.com', email: 'salma@gmail.com' }],
    }),
  );

  expect(useRegistrationDraftStore.getState()).toMatchObject({
    authProvider: 'google',
    email: 'salma@gmail.com',
    accountPhone: null,
    passwordEmail: null,
    phone: '',
  });
});

it('falls back to the phone wizard for a Google account whose email is not verified', () => {
  seedDraftFromAccount(
    account({
      email: 'salma@gmail.com',
      emailVerified: false,
      providerData: [{ providerId: 'google.com', email: 'salma@gmail.com' }],
    }),
  );

  expect(useRegistrationDraftStore.getState().authProvider).toBe('phone');
});

it('splits the display name into first and last name', () => {
  seedDraftFromAccount(account({ displayName: '  Salma  Abdel Aziz ' }));

  expect(useRegistrationDraftStore.getState()).toMatchObject({ firstName: 'Salma', lastName: 'Abdel Aziz' });
});

it('replaces whatever draft was there, and can mark a fresh (non-resume) sign-up', () => {
  useRegistrationDraftStore.getState().patch({ address: '1 Old Street', role: 'nanny' });

  seedDraftFromAccount(account({}), { isResume: false });

  expect(useRegistrationDraftStore.getState()).toMatchObject({
    isResume: false,
    signUpUid: 'uid-leftover',
    address: '',
    role: null,
  });
});
