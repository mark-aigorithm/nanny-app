import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import type { SurveyQuestion } from '@nanny-app/shared';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import SurveyQuestionInput from '@mobile/components/survey/SurveyQuestionInput';
import { colors, fontFamily } from '@mobile/theme';

const QUESTION: SurveyQuestion = {
  id: 1,
  order: 0,
  type: 'MULTI_CHOICE',
  prompt: 'What do you book for?',
  required: false,
  options: [
    { id: 10, order: 0, label: 'Work' },
    { id: 11, order: 1, label: 'Errands' },
  ],
};

describe('SurveyQuestionInput choices', () => {
  // The UI sweep found picked chips drawn in a paler text than unpicked ones,
  // so a chosen answer read as disabled.
  it('draws a picked option at least as strongly as an unpicked one', () => {
    render(<SurveyQuestionInput question={QUESTION} answer={{ questionId: 1, optionIds: [10] }} onChange={jest.fn()} />);
    const picked = StyleSheet.flatten(screen.getByText('Work').props.style);
    const unpicked = StyleSheet.flatten(screen.getByText('Errands').props.style);
    expect(picked.color).toBe(colors.textPrimary);
    expect(unpicked.color).toBe(colors.textPrimary);
    expect(picked.fontFamily).toBe(fontFamily.semiBold);
  });
});
