import React from 'react';
import { render } from '@testing-library/react-native';

const mockUsePendingRating = jest.fn();
jest.mock('@mobile/hooks/usePendingRating', () => ({
  usePendingRating: () => mockUsePendingRating(),
  PENDING_RATING_KEY: ['pending-rating'],
}));
let mockUpdateRequired = false;
jest.mock('@mobile/hooks/useAppVersionCheck', () => ({
  useIsUpdateRequired: () => mockUpdateRequired,
}));
jest.mock('@mobile/components/RatingPromptSheet', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>sheet</Text> };
});

import RatingPromptHost from '@mobile/components/RatingPromptHost';

beforeEach(() => {
  mockUpdateRequired = false;
});

it('runs detection and renders the sheet', () => {
  const { getByText } = render(<RatingPromptHost />);
  expect(mockUsePendingRating).toHaveBeenCalled();
  expect(getByText('sheet')).toBeTruthy();
});

it('renders nothing while an app update is required', () => {
  mockUpdateRequired = true;
  const { queryByText } = render(<RatingPromptHost />);
  expect(queryByText('sheet')).toBeNull();
});
