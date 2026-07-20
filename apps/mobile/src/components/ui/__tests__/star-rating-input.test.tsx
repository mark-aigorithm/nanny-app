import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import StarRatingInput, { RATING_LABELS } from '@mobile/components/ui/star-rating-input';

describe('StarRatingInput', () => {
  it('renders five star buttons', () => {
    const { getAllByRole } = render(<StarRatingInput rating={0} onChange={() => {}} />);
    expect(getAllByRole('button')).toHaveLength(5);
  });

  it('calls onChange with the tapped star value', () => {
    const onChange = jest.fn();
    const { getAllByRole } = render(<StarRatingInput rating={0} onChange={onChange} />);
    fireEvent.press(getAllByRole('button')[3]);
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('shows the label for the current rating when showLabel is set', () => {
    const { getByText } = render(<StarRatingInput rating={5} onChange={() => {}} showLabel />);
    expect(getByText(RATING_LABELS[5])).toBeTruthy();
  });

  it('hides the label when showLabel is false', () => {
    const { queryByText } = render(<StarRatingInput rating={5} onChange={() => {}} showLabel={false} />);
    expect(queryByText(RATING_LABELS[5])).toBeNull();
  });
});
