import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import E2eGooglePickerHost from '@mobile/components/E2eGooglePickerHost';
import { requestE2eGoogleEmail } from '@mobile/store/e2eGooglePickerStore';

it('stays hidden until a request comes in', () => {
  render(<E2eGooglePickerHost />);
  expect(screen.queryByText('Use this Google account')).toBeNull();
});

it('resolves with the typed address', async () => {
  render(<E2eGooglePickerHost />);
  let pending!: Promise<string | null>;
  act(() => {
    pending = requestE2eGoogleEmail();
  });

  fireEvent.changeText(screen.getByTestId('e2eGooglePicker.email'), ' mona@test.local ');
  fireEvent.press(screen.getByText('Use this Google account'));

  await expect(pending).resolves.toBe('mona@test.local');
  expect(screen.queryByText('Use this Google account')).toBeNull();
});

it('resolves null on cancel', async () => {
  render(<E2eGooglePickerHost />);
  let pending!: Promise<string | null>;
  act(() => {
    pending = requestE2eGoogleEmail();
  });

  fireEvent.press(screen.getByText('Cancel'));

  await expect(pending).resolves.toBeNull();
});
