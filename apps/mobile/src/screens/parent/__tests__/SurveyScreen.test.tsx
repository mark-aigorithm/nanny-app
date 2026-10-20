import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { MotherSurvey } from '@nanny-app/shared';

import { ApiRequestError } from '@mobile/lib/api';

const mockSubmit = jest.fn();
const mockSkip = jest.fn();
const mockDismissTo = jest.fn();
let mockKeyboardVisible = false;
let mockPending: { id: number }[] = [];
let mockSubmitError: unknown = null;
let mockSurveyIdParam = '4';
let mockSurveyState: { data?: MotherSurvey; isPending: boolean; error: unknown } = {
  isPending: true,
  error: null,
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ surveyId: mockSurveyIdParam }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn(), dismissTo: mockDismissTo }),
}));
jest.mock('@mobile/hooks/useKeyboardVisible', () => ({ useKeyboardVisible: () => mockKeyboardVisible }));
// The icon font loads asynchronously and would set state outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@mobile/hooks/useSurveys', () => ({
  useSurvey: () => mockSurveyState,
  useSubmitSurvey: () => ({ mutate: mockSubmit, isPending: false, isSuccess: false, error: mockSubmitError }),
  useSkipSurvey: () => ({ mutate: mockSkip, isPending: false }),
  usePendingSurveys: () => ({ data: mockPending }),
}));

import SurveyScreen from '@mobile/screens/parent/SurveyScreen';
import { wasSurveyPrompted } from '@mobile/store/surveyPromptStore';

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
    mockSurveyIdParam = '4';
    mockDismissTo.mockReset();
    mockKeyboardVisible = false;
    mockPending = [];
    mockSubmitError = null;
  });

  // However she got here (push, notification, profile list, deep link), the
  // prompt sheet must not offer this survey on top of it.
  it('marks the survey prompted on mount', () => {
    mockSurveyIdParam = '31';
    mockSurveyState = { isPending: true, error: null };
    render(<SurveyScreen />);
    expect(wasSurveyPrompted(31)).toBe(true);
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

  it('says thank you after a successful submit', () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    mockSubmit.mockImplementation((_answers, options: { onSuccess: () => void }) => options.onSuccess());
    render(<SurveyScreen />);
    fireEvent.press(screen.getByRole('radio', { name: 'Yes' }));
    fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getAllByText('Thank you!').length).toBeGreaterThan(0);
    expect(screen.getByText('Your answers help us look after your family better.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it.each(['abc', '0', ''])('ends with a message instead of a spinner for surveyId %p', (bad) => {
    mockSurveyIdParam = bad;
    mockSurveyState = { data: undefined, isPending: true, error: null };
    render(<SurveyScreen />);
    expect(screen.getByText("We couldn't open this survey.")).toBeTruthy();
    // One exit control in the header; the in-content action says where it goes.
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'Back to home' }));
    expect(mockDismissTo).toHaveBeenCalledWith('/(parent)/(tabs)/home');
  });

  it('shows a long title in full, as a heading in the scroll, not cut off in the header', () => {
    const title = 'One quick question about your last booking, from the request to the goodbye';
    mockSurveyState = { data: { ...SURVEY, title }, isPending: false, error: null };
    render(<SurveyScreen />);
    const heading = screen.getByRole('header', { name: title });
    expect(heading.props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Survey')).toBeTruthy();
  });

  // The footer sits below the scroll view, not over it, so padding the content
  // by its height left a blank band the size of the footer (UI sweep).
  it("doesn't pad the questions by the footer's height", () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    const { UNSAFE_getAllByType } = render(<SurveyScreen />);
    const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
    const scroll = UNSAFE_getAllByType(ScrollView)[0]!;
    let footer = screen.getByRole('button', { name: 'Submit' }).parent;
    while (footer && !footer.props.onLayout) footer = footer.parent;
    const before = StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom;
    if (footer) fireEvent(footer, 'layout', { persist: () => undefined, nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 200 } } });
    const after = StyleSheet.flatten(UNSAFE_getAllByType(ScrollView)[0]!.props.contentContainerStyle).paddingBottom;
    expect(after).toBe(before);
    expect(after).toBeLessThan(100);
  });

  it('skips the survey', () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    render(<SurveyScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
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

  // Submit used to sit disabled with nothing saying why.
  it('says which required question is left while Submit is disabled', () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    render(<SurveyScreen />);
    expect(screen.getByText('Answer question 1 to send')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit' }).props.accessibilityHint).toBe('Answer question 1 to send');
    fireEvent.press(screen.getByRole('radio', { name: 'Yes' }));
    expect(screen.queryByText('Answer question 1 to send')).toBeNull();
  });

  it('counts the required questions left when there are several', () => {
    const questions = [
      ...SURVEY.questions,
      { id: 3, order: 2, type: 'RATING' as const, prompt: 'Rate us', required: true, options: [] },
    ];
    mockSurveyState = { data: { ...SURVEY, questions }, isPending: false, error: null };
    render(<SurveyScreen />);
    expect(screen.getByText('Answer the 2 required questions to send')).toBeTruthy();
  });

  // With the keyboard up on a small phone the field had about 140px left.
  it('hides Skip while the keyboard is up', () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    mockKeyboardVisible = true;
    render(<SurveyScreen />);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
  });

  it('labels the loading spinner', () => {
    mockSurveyState = { isPending: true, error: null };
    render(<SurveyScreen />);
    expect(screen.getByLabelText('Loading survey')).toBeTruthy();
  });

  // The focused Submit unmounts on success, so a screen reader heard nothing.
  it('announces that the answers were sent', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    mockSubmit.mockImplementation((_answers, options: { onSuccess: () => void }) => options.onSuccess());
    render(<SurveyScreen />);
    fireEvent.press(screen.getByRole('radio', { name: 'Yes' }));
    fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
    expect(announce).toHaveBeenCalledWith('Thank you! Your answers were sent.');
    announce.mockRestore();
  });

  it('offers her other surveys from the closed state, and announces it', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    mockPending = [{ id: 4 }, { id: 9 }];
    mockSurveyState = { data: undefined, isPending: false, error: new ApiRequestError('This survey has closed.', 409) };
    render(<SurveyScreen />);
    expect(announce).toHaveBeenCalledWith('This survey has closed.');
    fireEvent.press(screen.getByRole('button', { name: 'See your surveys' }));
    expect(mockDismissTo).toHaveBeenCalledWith('/(parent)/surveys');
    announce.mockRestore();
  });

  it('goes home from the closed state when nothing else is waiting', () => {
    mockPending = [{ id: 4 }];
    mockSurveyState = { data: undefined, isPending: false, error: new ApiRequestError('This survey has closed.', 409) };
    render(<SurveyScreen />);
    expect(screen.queryByRole('button', { name: 'See your surveys' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to home' })).toBeTruthy();
  });

  // An admin closed it while she was answering: say her answers were not sent.
  it('says her answers were not sent when Submit meets a closed survey', () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    mockSubmitError = new ApiRequestError('This survey has closed.', 409);
    render(<SurveyScreen />);
    expect(screen.getByText("We couldn't send your answers. This survey has closed.")).toBeTruthy();
  });

  // Focusing the text answer scrolled only the field into view, so on a small
  // phone with the keyboard up she typed without seeing the question.
  it('scrolls a focused text answer so its question shows', () => {
    mockSurveyState = { data: SURVEY, isPending: false, error: null };
    const { UNSAFE_getAllByType } = render(<SurveyScreen />);
    const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
    const scroll = UNSAFE_getAllByType(ScrollView)[0]!;
    const scrollTo = jest.fn();
    (scroll.instance as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
    let question = screen.getByText(/Anything else\?/).parent;
    while (question && !question.props.onLayout) question = question.parent;
    fireEvent(question!, 'layout', { nativeEvent: { layout: { x: 0, y: 420, width: 312, height: 160 } } });
    fireEvent(screen.getByLabelText('Anything else?'), 'focus');
    expect(scrollTo).toHaveBeenCalledWith({ y: 408, animated: true });
  });
});
