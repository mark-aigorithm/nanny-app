import React from 'react';
import { render } from '@testing-library/react-native';

let mockUpdateRequired = false;
jest.mock('@mobile/hooks/useAppVersionCheck', () => ({
  useIsUpdateRequired: () => mockUpdateRequired,
}));
jest.mock('@mobile/components/NannyShiftPromptModal', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>shift prompt</Text> };
});

import NannyShiftPromptHost from '@mobile/components/NannyShiftPromptHost';

beforeEach(() => {
  mockUpdateRequired = false;
});

it('renders the shift prompt normally', () => {
  const { getByText } = render(<NannyShiftPromptHost />);
  expect(getByText('shift prompt')).toBeTruthy();
});

it('renders nothing while an app update is required', () => {
  mockUpdateRequired = true;
  const { queryByText } = render(<NannyShiftPromptHost />);
  expect(queryByText('shift prompt')).toBeNull();
});
