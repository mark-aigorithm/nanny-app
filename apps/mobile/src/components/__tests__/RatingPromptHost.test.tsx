import React from 'react';
import { render } from '@testing-library/react-native';

const mockUsePendingRating = jest.fn();
jest.mock('@mobile/hooks/usePendingRating', () => ({
  usePendingRating: () => mockUsePendingRating(),
  PENDING_RATING_KEY: ['pending-rating'],
}));
jest.mock('@mobile/components/RatingPromptSheet', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>sheet</Text> };
});

import RatingPromptHost from '@mobile/components/RatingPromptHost';

it('runs detection and renders the sheet', () => {
  const { getByText } = render(<RatingPromptHost />);
  expect(mockUsePendingRating).toHaveBeenCalled();
  expect(getByText('sheet')).toBeTruthy();
});
