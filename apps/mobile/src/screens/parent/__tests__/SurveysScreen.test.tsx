import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockRefetch = jest.fn();
let mockState: { data?: unknown[]; isLoading: boolean; isError: boolean } = { isLoading: false, isError: false };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@mobile/hooks/useSurveys', () => ({
  usePendingSurveys: () => ({ ...mockState, refetch: mockRefetch }),
}));
jest.mock('@mobile/lib/notificationNavigation', () => ({
  navigateToSurvey: (...args: unknown[]) => mockNavigate(...args),
}));

import SurveysScreen from '@mobile/screens/parent/SurveysScreen';

// Icon fonts load asynchronously; let them land inside act.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  mockNavigate.mockReset();
  mockRefetch.mockReset();
});

describe('SurveysScreen', () => {
  it('does not claim she is caught up while loading', () => {
    mockState = { isLoading: true, isError: false };
    render(<SurveysScreen />);
    expect(screen.queryByText("You're all caught up.")).toBeNull();
  });

  it('offers a retry when loading fails', () => {
    mockState = { isLoading: false, isError: true };
    render(<SurveysScreen />);
    expect(screen.queryByText("You're all caught up.")).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('says she is caught up when loaded and empty', () => {
    mockState = { data: [], isLoading: false, isError: false };
    render(<SurveysScreen />);
    expect(screen.getByText("You're all caught up.")).toBeTruthy();
  });

  it('opens a survey from its row', async () => {
    mockState = {
      data: [{ id: 4, title: 'Feedback', status: 'SKIPPED', questionCount: 1 }],
      isLoading: false,
      isError: false,
    };
    render(<SurveysScreen />);
    await settle();
    expect(screen.getByText('Skipped')).toBeTruthy();
    fireEvent.press(screen.getByText('Feedback'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.anything(), 4);
  });

  // One name per state: a pending survey is "New", a skipped one "Skipped".
  it('tags each survey with its status and names the row for screen readers', async () => {
    mockState = {
      data: [
        { id: 4, title: 'Feedback', status: 'SKIPPED', questionCount: 1 },
        { id: 5, title: 'How are we doing?', status: 'PENDING', questionCount: 5 },
      ],
      isLoading: false,
      isError: false,
    };
    render(<SurveysScreen />);
    await settle();
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Feedback, 1 question, skipped' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'How are we doing?, 5 questions, new' })).toBeTruthy();
  });

  it('shows the header hairline once the list scrolls under it', async () => {
    mockState = { data: [{ id: 4, title: 'Feedback', status: 'SKIPPED', questionCount: 1 }], isLoading: false, isError: false };
    const { UNSAFE_getAllByType } = render(<SurveysScreen />);
    await settle();
    const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
    const StackHeader = jest.requireActual<typeof import('@mobile/components/ui')>('@mobile/components/ui').StackHeader;
    fireEvent.scroll(UNSAFE_getAllByType(ScrollView)[0]!, { nativeEvent: { contentOffset: { y: 24 } } });
    expect(UNSAFE_getAllByType(StackHeader)[0]!.props.scrolled).toBe(true);
  });
});
