import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CURRENT_TERMS_VERSION } from '@nanny-app/shared';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockDismissAll = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    dismissTo: mockDismissTo,
    dismissAll: mockDismissAll,
  }),
}));

const mockRegister = jest.fn();
const mockSignOut = jest.fn((_v: unknown, o?: { onSettled?: () => void }) => o?.onSettled?.());
jest.mock('@mobile/hooks/useAuth', () => ({
  useRegisterProfile: () => ({ mutateAsync: mockRegister, isPending: false }),
  useSignOut: () => ({ mutate: mockSignOut, isPending: false }),
}));
const mockRedeem = jest.fn();
jest.mock('@mobile/hooks/useReferrals', () => ({
  useRedeemReferralCode: () => ({ mutateAsync: mockRedeem, isPending: false }),
}));
// A plain input standing in for the real field, so a test can type a code.
jest.mock('@mobile/components/ReferralCodeField', () => {
  const { TextInput } = jest.requireActual('react-native');
  return ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <TextInput testID="referral" value={value} onChangeText={onChange} />
  );
});
const mockUpload = jest.fn();
jest.mock('@mobile/lib/storage', () => ({
  uploadImageToFirebase: (...args: unknown[]) => mockUpload(...args),
}));
const mockAbandon = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/pendingLink', () => ({
  abandonSocialSignUpForLink: (...args: unknown[]) => mockAbandon(...args),
}));
const mockNotice = jest.fn();
jest.mock('@mobile/store/confirmDialogStore', () => ({
  noticeDialog: (...args: unknown[]) => mockNotice(...args),
}));

let mockCurrentUser: { uid: string; phoneNumber: string | null } | null = null;
jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
  }),
}));

import { ApiRequestError } from '@mobile/lib/api';
import RegistrationFinishScreen from '@mobile/screens/auth/RegistrationFinishScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const PHONE = '+201001234567';
const PHOTO = 'file:///photo.jpg';
const AVATAR_URL = 'https://storage.test/avatars/uid/photo.jpg';

function seedMother(extra: Record<string, unknown> = {}) {
  useRegistrationDraftStore.setState({
    role: 'parent',
    authProvider: 'phone',
    signUpUid: 'uid-1',
    accountPhone: PHONE,
    firstName: 'Mona',
    lastName: 'Adel',
    email: 'mona@example.com',
    emailVerificationToken: 'tok',
    verifiedEmail: 'mona@example.com',
    dob: '05/10/1990',
    latitude: 30.04,
    longitude: 31.23,
    address: '1 Test Street, Cairo',
    photoUri: PHOTO,
    avatarUpload: { uri: PHOTO, url: AVATAR_URL },
    ...extra,
  });
}

function seedNanny(extra: Record<string, unknown> = {}) {
  seedMother({
    role: 'nanny',
    idDocumentType: 'NATIONAL_ID',
    idFrontUri: 'file:///front.jpg',
    idBackUri: 'file:///back.jpg',
    idFrontUpload: { uri: 'file:///front.jpg', url: 'https://storage.test/nanny-ids/front.jpg' },
    idBackUpload: { uri: 'file:///back.jpg', url: 'https://storage.test/nanny-ids/back.jpg' },
    bio: 'Ten years with toddlers.',
    yearsOfExperience: '10',
    ageRanges: ['1-3'],
    availabilityType: 'FULL_TIME',
    ...extra,
  });
}

async function completeSetup() {
  fireEvent.press(screen.getByText(/^I agree to the/));
  await act(async () => {
    fireEvent.press(screen.getByText('Complete setup'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  mockCurrentUser = { uid: 'uid-1', phoneNumber: PHONE };
  mockRegister.mockResolvedValue({ id: 1 });
  mockRedeem.mockResolvedValue(undefined);
  mockUpload.mockImplementation(async (uri: string, folder: string) => `https://storage.test/${folder}/${uri.split('/').pop()}`);
});

it('labels itself the last step, and says who she is signed in as', () => {
  seedMother();
  render(<RegistrationFinishScreen />);
  expect(screen.getByText('STEP 5 OF 5 — FINISH')).toBeTruthy();
  expect(screen.getByText(`Signed in as ${PHONE}`)).toBeTruthy();
});

it('keeps Complete setup off until the terms are accepted', async () => {
  seedMother();
  render(<RegistrationFinishScreen />);
  await act(async () => {
    fireEvent.press(screen.getByText('Complete setup'));
  });
  expect(mockRegister).not.toHaveBeenCalled();
});

it('opens the Terms of Service and the Privacy Policy', () => {
  seedMother();
  render(<RegistrationFinishScreen />);

  fireEvent.press(screen.getByText('Terms of Service'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/legal/[key]', params: { key: 'terms' } });
  fireEvent.press(screen.getByText('Privacy Policy'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/legal/[key]', params: { key: 'privacy' } });
});

it('registers with what the draft holds — no upload when the photo already went up', async () => {
  seedMother();
  render(<RegistrationFinishScreen />);
  await completeSetup();

  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockRegister).toHaveBeenCalledWith(
    expect.objectContaining({
      email: 'mona@example.com',
      emailVerificationToken: 'tok',
      phone: PHONE,
      role: 'MOTHER',
      avatarUrl: AVATAR_URL,
      termsAcceptedVersion: CURRENT_TERMS_VERSION,
    }),
  );
});

it('leaves the wizard for good: dismisses the stack, then the notification prompt', async () => {
  seedMother();
  render(<RegistrationFinishScreen />);
  await completeSetup();

  expect(mockDismissAll).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/(auth)/notification-permission',
    params: { role: 'parent' },
  });
  expect(mockDismissAll.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0] as number);
  expect(useRegistrationDraftStore.getState().signUpUid).toBeNull();
});

it('uploads, as a fallback, a photo an earlier step did not', async () => {
  seedMother({ avatarUpload: null });
  render(<RegistrationFinishScreen />);
  await completeSetup();

  expect(mockUpload).toHaveBeenCalledWith(PHOTO, 'avatars');
  expect(mockRegister).toHaveBeenCalledWith(
    expect.objectContaining({ avatarUrl: 'https://storage.test/avatars/photo.jpg' }),
  );
});

it('says the photos failed to upload, and registers nothing, when an upload throws', async () => {
  seedMother({ avatarUpload: null });
  mockUpload.mockRejectedValue(new Error('offline'));
  render(<RegistrationFinishScreen />);
  await completeSetup();

  expect(screen.getByText("Couldn't upload your photos. Check your connection and try again.")).toBeTruthy();
  expect(mockRegister).not.toHaveBeenCalled();
});

it('a nanny: sends her uploaded ID and profile, and sees no referral field', async () => {
  seedNanny();
  render(<RegistrationFinishScreen />);
  expect(screen.queryByTestId('referral')).toBeNull();
  await completeSetup();

  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockRegister).toHaveBeenCalledWith(
    expect.objectContaining({
      role: 'NANNY',
      idDocumentType: 'NATIONAL_ID',
      idDocumentFrontUrl: 'https://storage.test/nanny-ids/front.jpg',
      idDocumentBackUrl: 'https://storage.test/nanny-ids/back.jpg',
      yearsOfExperience: 10,
    }),
  );
});

it('a nanny whose ID is missing is sent back for it', async () => {
  seedNanny({ idFrontUri: null });
  render(<RegistrationFinishScreen />);
  await completeSetup();

  expect(screen.getByText('Your ID is missing. Please go back and upload it.')).toBeTruthy();
  expect(mockRegister).not.toHaveBeenCalled();
});

describe('the referral code', () => {
  it('is redeemed once the account exists', async () => {
    seedMother();
    render(<RegistrationFinishScreen />);
    fireEvent.changeText(screen.getByTestId('referral'), ' MONA10 ');
    await completeSetup();

    expect(mockRedeem).toHaveBeenCalledWith('MONA10');
    expect(mockRegister.mock.invocationCallOrder[0]).toBeLessThan(mockRedeem.mock.invocationCallOrder[0] as number);
    expect(mockReplace).toHaveBeenCalled();
  });

  it("that won't apply doesn't block her, but she is told before moving on", async () => {
    seedMother();
    mockRedeem.mockRejectedValue(new Error('expired'));
    render(<RegistrationFinishScreen />);
    fireEvent.changeText(screen.getByTestId('referral'), 'OLD');
    await completeSetup();

    expect(mockNotice).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Your account is ready' }),
    );
    expect(mockReplace).not.toHaveBeenCalled();

    const [{ onDismiss }] = mockNotice.mock.calls[0] as [{ onDismiss: () => void }];
    act(() => onDismiss());
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(auth)/notification-permission' }),
    );
  });
});

describe('a session that no longer matches the sign-up', () => {
  it('says so, offers Start again, and registers nothing', async () => {
    seedMother();
    mockCurrentUser = { uid: 'uid-someone-else', phoneNumber: PHONE };
    render(<RegistrationFinishScreen />);
    await completeSetup();

    expect(screen.getByText('Your session ended. Please start again.')).toBeTruthy();
    expect(mockRegister).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Start again'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('counts a signed-in account without the verified number as a mismatch too', async () => {
    seedMother();
    mockCurrentUser = { uid: 'uid-1', phoneNumber: null };
    render(<RegistrationFinishScreen />);
    await completeSetup();

    expect(screen.getByText('Start again')).toBeTruthy();
    expect(mockRegister).not.toHaveBeenCalled();
  });
});

it('phone wizard: refuses to go on without the email proof', async () => {
  seedMother({ emailVerificationToken: null });
  render(<RegistrationFinishScreen />);
  await completeSetup();

  expect(screen.getByText('Your email is not verified. Please go back and confirm the code.')).toBeTruthy();
  expect(mockRegister).not.toHaveBeenCalled();
});

it('Google wizard: registers without a token', async () => {
  seedMother({ authProvider: 'google', emailVerificationToken: null });
  render(<RegistrationFinishScreen />);
  await completeSetup();

  expect(mockRegister.mock.calls[0][0]).not.toHaveProperty('emailVerificationToken');
});

it('Google wizard: a 409 from register (email or phone taken) starts the collision flow', async () => {
  seedMother({ authProvider: 'google', emailVerificationToken: null });
  mockRegister.mockRejectedValue(new ApiRequestError('taken', 409));
  render(<RegistrationFinishScreen />);
  await completeSetup();

  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
  expect(mockAbandon).toHaveBeenCalledWith(PHONE);
});

it('phone wizard: a 409 from register is shown, not treated as a collision', async () => {
  seedMother();
  mockRegister.mockRejectedValue(new ApiRequestError('An account with this email already exists.', 409));
  render(<RegistrationFinishScreen />);
  await completeSetup();

  expect(screen.getByText('An account with this email already exists.')).toBeTruthy();
  expect(mockAbandon).not.toHaveBeenCalled();
});
