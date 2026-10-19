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

describe('SurveyQuestionInput rating', () => {
  const RATING: SurveyQuestion = { id: 2, order: 0, type: 'RATING', prompt: 'Rate your nanny', required: true, options: [] };

  // A screen reader has to hear what the stars are for and which one is chosen.
  it('names the star group after the question and reports the chosen value', () => {
    render(<SurveyQuestionInput question={RATING} answer={{ questionId: 2, rating: 4 }} onChange={jest.fn()} />);
    // Not `accessible` itself (that would merge the stars into one element), so
    // RNTL's getByRole skips it: look it up by label and check its role.
    const group = screen.getByLabelText('Rate your nanny');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityValue).toEqual({ min: 1, max: 5, now: 4, text: '4 of 5 stars' });
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '5 stars' })).not.toBeChecked();
  });

  it('says it is not rated yet before a star is picked', () => {
    render(<SurveyQuestionInput question={RATING} answer={undefined} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Rate your nanny').props.accessibilityValue).toEqual({
      min: 1,
      max: 5,
      text: 'Not rated',
    });
  });
});
