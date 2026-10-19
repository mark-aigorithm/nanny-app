import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MotherSurveySummary } from '@nanny-app/shared';

const mockSkip = jest.fn();
const mockPush = jest.fn();
let mockPending: MotherSurveySummary[] = [];
let mockRatingBooking: unknown = null;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@mobile/hooks/useSurveys', () => ({
  usePendingSurveys: () => ({ data: mockPending }),
  useSkipSurvey: () => ({ mutate: mockSkip, isPending: false }),
  PENDING_SURVEYS_KEY: ['surveys', 'pending'],
}));
jest.mock('@mobile/store/ratingPromptStore', () => ({
  useRatingPromptStore: (sel: (s: { booking: unknown }) => unknown) => sel({ booking: mockRatingBooking }),
}));

import SurveyPromptHost from '@mobile/components/SurveyPromptHost';
import { pickSurveyToPrompt, wasSurveyPrompted } from '@mobile/store/surveyPromptStore';

const s = (id: number, status: 'PENDING' | 'SKIPPED'): MotherSurveySummary => ({
  id, title: `Survey ${id}`, description: null, status, questionCount: 3, lastSentAt: '2026-10-19T00:00:00.000Z',
});

function renderHost() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SurveyPromptHost />
    </QueryClientProvider>,
  );
}

describe('pickSurveyToPrompt', () => {
  it('prompts the oldest pending survey, never a skipped or dismissed one', () => {
    expect(pickSurveyToPrompt([s(1, 'SKIPPED'), s(2, 'PENDING'), s(3, 'PENDING')], new Set())?.id).toBe(2);
    expect(pickSurveyToPrompt([s(2, 'PENDING')], new Set([2]))).toBeNull();
  });
});

describe('SurveyPromptHost', () => {
  beforeEach(() => {
    mockSkip.mockReset();
    mockPush.mockReset();
    mockRatingBooking = null;
  });

  it('offers Answer and Skip for a pending survey', () => {
    mockPending = [s(7, 'PENDING')];
    renderHost();
    expect(screen.getByText('Survey 7')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(mockSkip).toHaveBeenCalledWith(7);
    expect(wasSurveyPrompted(7)).toBe(true);
    expect(screen.queryByText('Survey 7')).toBeNull();
  });

  it('opens the survey on Answer', () => {
    mockPending = [s(8, 'PENDING')];
    renderHost();
    fireEvent.press(screen.getByRole('button', { name: 'Answer' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(parent)/survey', params: { surveyId: '8' } });
  });

  it('hides for this session without skipping when dismissed', () => {
    mockPending = [s(10, 'PENDING')];
    renderHost();
    fireEvent(screen.getByTestId('survey-prompt-modal'), 'requestClose');
    expect(mockSkip).not.toHaveBeenCalled();
    expect(screen.queryByText('Survey 10')).toBeNull();
    expect(wasSurveyPrompted(10)).toBe(true);
  });

  it('closes the sheet when a refetch drops that survey', () => {
    mockPending = [s(11, 'PENDING')];
    const view = renderHost();
    expect(screen.getByText('Survey 11')).toBeTruthy();
    mockPending = [];
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SurveyPromptHost />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('Survey 11')).toBeNull();
  });

  it('waits while the rating prompt is showing', () => {
    mockPending = [s(9, 'PENDING')];
    mockRatingBooking = { id: 1 };
    renderHost();
    expect(screen.queryByText('Survey 9')).toBeNull();
  });
});
