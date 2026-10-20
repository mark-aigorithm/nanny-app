import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

import StarRatingInput, { RATING_LABELS } from '@mobile/components/ui/star-rating-input';
import { colors } from '@mobile/theme';
import { contrastRatio } from '@mobile/theme/contrast';

type IconProps = { name: string; color: string };
const mockIcon = jest.fn((_props: IconProps) => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props: IconProps) => mockIcon(props) }));

const iconsDrawn = () => mockIcon.mock.calls.map(([props]) => props);

describe('StarRatingInput', () => {
  beforeEach(() => mockIcon.mockClear());

  it('renders five star radios, only the chosen one checked', () => {
    render(<StarRatingInput rating={3} onChange={() => {}} />);
    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(5);
    expect(screen.getByRole('radio', { name: 'Rate 3 stars' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Rate 4 stars' })).not.toBeChecked();
  });

  it('calls onChange with the tapped star value', () => {
    const onChange = jest.fn();
    render(<StarRatingInput rating={0} onChange={onChange} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Rate 4 stars' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('names the group after the question it answers', () => {
    render(<StarRatingInput rating={0} onChange={() => {}} accessibilityLabel="How was it?" />);
    // Not a focusable element itself (that would swallow the stars on iOS), so by label.
    expect(screen.getByLabelText('How was it?').props.accessibilityRole).toBe('radiogroup');
  });

  // Icon contrast (WCAG 1.4.11): a star must read as a control at 3:1 on cream.
  it('draws unrated and rated stars at 3:1 or more on the page', () => {
    render(<StarRatingInput rating={2} onChange={() => {}} />);
    const outlines = iconsDrawn().filter((p) => p.name === 'star-outline');
    // Three unrated outlines plus the outline drawn over each of the two filled stars.
    expect(outlines).toHaveLength(5);
    for (const { color } of outlines) {
      expect(contrastRatio(color, colors.background)).toBeGreaterThanOrEqual(3);
    }
    expect(iconsDrawn().filter((p) => p.name === 'star')).toHaveLength(2);
  });

  it('shows the label for the current rating when showLabel is set', () => {
    render(<StarRatingInput rating={5} onChange={() => {}} showLabel />);
    const label = screen.getByText(RATING_LABELS[5]);
    expect(contrastRatio(label.props.style.color, colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('hides the label when showLabel is false', () => {
    render(<StarRatingInput rating={5} onChange={() => {}} showLabel={false} />);
    expect(screen.queryByText(RATING_LABELS[5])).toBeNull();
  });
});
