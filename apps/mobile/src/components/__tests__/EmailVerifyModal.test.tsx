import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockRequestCode = jest.fn();
const mockConfirmCode = jest.fn();
const mockSetError = jest.fn();
let mockError: string | null = null;

jest.mock('@mobile/hooks/useVerifiedEmailSubmit', () => ({
  useVerifiedEmailSubmit: () => ({
    requestCode: mockRequestCode,
    confirmCode: mockConfirmCode,
    isSending: false,
    isConfirming: false,
    error: mockError,
    setError: mockSetError,
  }),
}));

import EmailVerifyModal from '@mobile/components/EmailVerifyModal';
import { useEmailGateStore } from '@mobile/store/emailGateStore';

const EMAIL = 'sarah@example.com';

/** Fill in the first pane and tap Send code. */
async function reachCodePane(screen: ReturnType<typeof render>) {
  fireEvent.changeText(screen.getByTestId('emailGate.email'), EMAIL);
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => screen.getByText('Check your email'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockError = null;
  mockRequestCode.mockResolvedValue(true);
  mockConfirmCode.mockResolvedValue(true);
  useEmailGateStore.setState({ visible: true });
});

describe('EmailVerifyModal', () => {
  it('renders nothing while the gate is closed', () => {
    useEmailGateStore.setState({ visible: false });
    const { queryByText } = render(<EmailVerifyModal />);
    expect(queryByText('Confirm your email')).toBeNull();
  });

  it('says the phone number stays the way in, and asks for no password', () => {
    const { getByText, queryByTestId } = render(<EmailVerifyModal />);
    expect(getByText(/keep signing in with your phone number/i)).toBeTruthy();
    expect(queryByTestId('emailGate.password')).toBeNull();
  });

  it('walks address → code → confirmed, then closes the gate', async () => {
    const screen = render(<EmailVerifyModal />);

    await reachCodePane(screen);
    expect(mockRequestCode).toHaveBeenCalledWith(EMAIL);
    expect(screen.getByText(`We sent a 6-digit code to ${EMAIL}.`)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('emailGate.code'), '123456');
    fireEvent.press(screen.getByText('Confirm'));

    await waitFor(() => expect(mockConfirmCode).toHaveBeenCalledWith(EMAIL, '123456'));
    await waitFor(() => expect(useEmailGateStore.getState().visible).toBe(false));
  });

  it('refuses to send to an address that is not one', async () => {
    const { getByTestId, getByText } = render(<EmailVerifyModal />);

    fireEvent.changeText(getByTestId('emailGate.email'), 'not-an-address');
    fireEvent.press(getByText('Send code'));

    await waitFor(() => expect(mockSetError).toHaveBeenCalled());
    expect(mockRequestCode).not.toHaveBeenCalled();
  });

  it('stays on the first pane when the send fails', async () => {
    mockRequestCode.mockResolvedValue(false);
    const { getByTestId, getByText, queryByText } = render(<EmailVerifyModal />);

    fireEvent.changeText(getByTestId('emailGate.email'), EMAIL);
    fireEvent.press(getByText('Send code'));

    await waitFor(() => expect(mockRequestCode).toHaveBeenCalled());
    expect(queryByText('Check your email')).toBeNull();
  });

  it('keeps the gate open when the code is wrong', async () => {
    mockConfirmCode.mockResolvedValue(false);
    const screen = render(<EmailVerifyModal />);

    await reachCodePane(screen);
    fireEvent.changeText(screen.getByTestId('emailGate.code'), '000000');
    fireEvent.press(screen.getByText('Confirm'));

    await waitFor(() => expect(mockConfirmCode).toHaveBeenCalled());
    expect(useEmailGateStore.getState().visible).toBe(true);
  });

  it('surfaces the error the submit hook reported', () => {
    mockError = 'That code is not right. Please try again.';
    const { getByText } = render(<EmailVerifyModal />);
    expect(getByText('That code is not right. Please try again.')).toBeTruthy();
  });

  it('is dismissable — she can back out and keep browsing', () => {
    const { getByText } = render(<EmailVerifyModal />);
    fireEvent.press(getByText('Maybe later'));
    expect(useEmailGateStore.getState().visible).toBe(false);
  });
});
