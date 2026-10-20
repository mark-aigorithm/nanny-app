import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import type { SurveyQuestion } from '@nanny-app/shared';

type IconProps = { name: string; color: string };
const mockIcon = jest.fn((_props: IconProps) => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props: IconProps) => mockIcon(props) }));

import SurveyQuestionInput from '@mobile/components/survey/SurveyQuestionInput';
import { colors, fontFamily } from '@mobile/theme';
import { contrastRatio } from '@mobile/theme/contrast';

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
const SINGLE: SurveyQuestion = { ...QUESTION, type: 'SINGLE_CHOICE', prompt: 'Who referred you?' };
const YES_NO: SurveyQuestion = { id: 3, order: 0, type: 'YES_NO', prompt: 'Would you recommend us?', required: true, options: [] };

const iconNames = () => mockIcon.mock.calls.map(([props]) => props.name);

/** The option's outer box: the nearest ancestor of its label with a border. */
function optionBox(label: string) {
  let node = screen.getByText(label).parent;
  while (node && StyleSheet.flatten(node.props.style)?.borderColor === undefined) node = node.parent;
  return StyleSheet.flatten(node?.props.style);
}

describe('SurveyQuestionInput choices', () => {
  beforeEach(() => mockIcon.mockClear());

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

  // A multiple-choice question looked exactly like a single-choice one.
  it('tells her she may pick several, and draws checkboxes for a multiple choice', () => {
    render(<SurveyQuestionInput question={QUESTION} answer={{ questionId: 1, optionIds: [10] }} onChange={jest.fn()} />);
    expect(screen.getByText('Choose all that apply')).toBeTruthy();
    expect(iconNames()).toEqual(expect.arrayContaining(['checkbox', 'square-outline']));
    expect(iconNames()).not.toContain('radio-button-on');
  });

  it('draws radio glyphs and no helper line for a single choice', () => {
    render(<SurveyQuestionInput question={SINGLE} answer={{ questionId: 1, optionIds: [11] }} onChange={jest.fn()} />);
    expect(screen.queryByText('Choose all that apply')).toBeNull();
    expect(iconNames()).toEqual(expect.arrayContaining(['radio-button-on', 'radio-button-off']));
  });

  // Control boundaries need 3:1 (WCAG 1.4.11); warmBorder was 1.28:1 on cream.
  it('gives an unpicked option a border that reads as a control', () => {
    render(<SurveyQuestionInput question={QUESTION} answer={undefined} onChange={jest.fn()} />);
    const box = optionBox('Work');
    expect(contrastRatio(box.borderColor as string, colors.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(box.borderColor as string, colors.surface)).toBeGreaterThanOrEqual(3);
    // The glyph and label sit at the start of the row, not centred (sweep).
    expect(box.justifyContent).toBeUndefined();
  });

  // A screen reader that swipes into the middle of a question hears what it asks.
  it.each([
    ['multiple choice', QUESTION],
    ['single choice', SINGLE],
    ['yes/no', YES_NO],
  ])('names the %s group after its question', (_kind, question) => {
    render(<SurveyQuestionInput question={question} answer={undefined} onChange={jest.fn()} />);
    expect(screen.getByLabelText(question.prompt)).toBeTruthy();
  });
});

describe('SurveyQuestionInput rating', () => {
  const RATING: SurveyQuestion = { id: 2, order: 0, type: 'RATING', prompt: 'Rate your nanny', required: true, options: [] };

  // A screen reader has to hear what the stars are for and which one is chosen.
  it('names the star group after the question and checks the chosen star', () => {
    render(<SurveyQuestionInput question={RATING} answer={{ questionId: 2, rating: 4 }} onChange={jest.fn()} />);
    // Not `accessible` itself (that would merge the stars into one element), so
    // RNTL's getByRole skips it: look it up by label and check its role.
    const group = screen.getByLabelText('Rate your nanny');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Rate 4 stars' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Rate 5 stars' })).not.toBeChecked();
  });

  // The value is shown in words, so it never rides on the star colour alone.
  it('shows the rating as a word under the stars', () => {
    render(<SurveyQuestionInput question={RATING} answer={{ questionId: 2, rating: 4 }} onChange={jest.fn()} />);
    expect(screen.getByText('Very Good')).toBeTruthy();
  });
});
