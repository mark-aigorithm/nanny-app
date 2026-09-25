import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
const mockUpload = jest.fn();
jest.mock('@mobile/lib/storage', () => ({
  uploadImageToFirebase: (...args: unknown[]) => mockUpload(...args),
}));
jest.mock('@mobile/lib/pickImage', () => ({ pickImageFromLibrary: jest.fn() }));

import RegistrationNannyIdScreen from '@mobile/screens/auth/RegistrationNannyIdScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const FRONT = 'file:///front.jpg';
const BACK = 'file:///back.jpg';

async function pressContinue() {
  await act(async () => {
    fireEvent.press(screen.getByText('Continue'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  useRegistrationDraftStore.setState({
    role: 'nanny',
    idDocumentType: 'NATIONAL_ID',
    idFrontUri: FRONT,
    idBackUri: BACK,
  });
  mockUpload.mockImplementation(async (uri: string) => `https://storage.test/nanny-ids/${uri.split('/').pop()}`);
});

it('labels itself step 6 of the nanny’s 7, just before Finish', () => {
  render(<RegistrationNannyIdScreen />);
  expect(screen.getByText('STEP 6 OF 7 — VERIFY YOUR IDENTITY')).toBeTruthy();
});

it('uploads both sides of a national ID on Continue, then goes to Finish', async () => {
  render(<RegistrationNannyIdScreen />);
  await pressContinue();

  expect(mockUpload).toHaveBeenCalledWith(FRONT, 'nanny-ids');
  expect(mockUpload).toHaveBeenCalledWith(BACK, 'nanny-ids');
  expect(useRegistrationDraftStore.getState()).toMatchObject({
    idFrontUpload: { uri: FRONT, url: 'https://storage.test/nanny-ids/front.jpg' },
    idBackUpload: { uri: BACK, url: 'https://storage.test/nanny-ids/back.jpg' },
  });
  expect(mockPush).toHaveBeenCalledWith('/(auth)/register-finish');
});

it('uploads only the front of a passport', async () => {
  useRegistrationDraftStore.setState({ idDocumentType: 'PASSPORT', idBackUri: null });
  render(<RegistrationNannyIdScreen />);
  await pressContinue();

  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockUpload).toHaveBeenCalledWith(FRONT, 'nanny-ids');
});

it('re-uploads only the side that changed', async () => {
  useRegistrationDraftStore.setState({
    idFrontUpload: { uri: FRONT, url: 'https://storage.test/nanny-ids/front.jpg' },
    idBackUpload: { uri: 'file:///old-back.jpg', url: 'https://storage.test/nanny-ids/old-back.jpg' },
  });
  render(<RegistrationNannyIdScreen />);
  await pressContinue();

  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockUpload).toHaveBeenCalledWith(BACK, 'nanny-ids');
});

it('stays, with the reason, when an upload fails', async () => {
  mockUpload.mockRejectedValueOnce(new Error('offline'));
  render(<RegistrationNannyIdScreen />);
  await pressContinue();

  expect(screen.getByText("Couldn't upload your ID. Check your connection and try again.")).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

it('asks for the back of a national ID before uploading anything', async () => {
  useRegistrationDraftStore.setState({ idBackUri: null });
  render(<RegistrationNannyIdScreen />);
  await pressContinue();

  expect(screen.getByText('Please upload the back of your ID.')).toBeTruthy();
  expect(mockUpload).not.toHaveBeenCalled();
});
