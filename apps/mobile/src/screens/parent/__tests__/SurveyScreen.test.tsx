import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { MotherSurvey } from '@nanny-app/shared';

import { ApiRequestError } from '@mobile/lib/api';

const mockSubmit = jest.fn();
const mockSkip = jest.fn();
let mockSurveyState: { data?: MotherSurvey; isPending: boolean; error: unknown } = {
  isPending: true,
  error: null,
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ surveyId: '4' }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));
// The icon font loads asynchronously and would set state outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@mobile/hooks/useSurveys', () => ({
  useSurvey: () => mockSurveyState,
  useSubmitSurvey: () => ({ mutate: mockSubmit, isPending: false, isSuccess: false, error: null }),
  useSkipSurvey: () => ({ mutate: mockSkip, isPending: false }),
}));

import SurveyScreen from '@mobile/screens/parent/SurveyScreen';

const SURVEY: MotherSurvey = {
  id: 4,
  title: 'How are we doing?',
  description: null,
  questions: [
    { id: 1, order: 0, type: 'YES_NO', prompt: 'Would you recommend us?', required: true, options: [] },
    { id: 2, order: 1, type: 'TEXT', prompt: 'Anything else?', required: false, options: [] },
  ],
};

describe('SurveyScreen', () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    mockSkip.mockReset();
  });

  it('enables Submit once required questions are answered and sends the answers', () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    render(<SurveyScreen />);
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();

    fireEvent.press(screen.getByRole('radio', { name: 'Yes' }));
    expect(submit).toBeEnabled();
    fireEvent.press(submit);
    expect(mockSubmit).toHaveBeenCalledWith([{ questionId: 1, bool: true }], expect.anything());
  });

  it('skips the survey', () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    render(<SurveyScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    expect(mockSkip).toHaveBeenCalledWith(4, expect.anything());
  });

  it('shows the closed state when the survey has closed', () => {
    mockSurveyState = {
      data: undefined,
      isPending: false,
      error: new ApiRequestError('This survey has closed.', 409),
    };
    render(<SurveyScreen />);
    expect(screen.getByText('This survey has closed.')).toBeTruthy();
  });
});
