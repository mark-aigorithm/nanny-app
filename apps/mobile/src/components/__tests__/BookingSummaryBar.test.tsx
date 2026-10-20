import React from 'react';
import { Text } from '@mobile/components/ui/text';
import { render, screen } from '@testing-library/react-native';

let mockKeyboardVisible = false;
jest.mock('@mobile/hooks/useKeyboardVisible', () => ({ useKeyboardVisible: () => mockKeyboardVisible }));

import BookingSummaryBar from '@mobile/components/BookingSummaryBar';

const SUMMARY = 'Thu, Jul 30 · 8:00 AM - 12:00 PM · 4h';

function renderBar() {
  return render(
    <BookingSummaryBar summary={SUMMARY} total="EGP 480" ctaLabel="Request care · EGP 480" onPress={jest.fn()}>
      <Text>Nothing to pay</Text>
    </BookingSummaryBar>,
  );
}

beforeEach(() => {
  mockKeyboardVisible = false;
});

describe('BookingSummaryBar', () => {
  // The sweep found the booking time cut off on Step 1 at 1.3×.
  it('lets the date-and-time recap wrap instead of cutting the time off', () => {
    renderBar();
    expect(screen.getByText(SUMMARY).props.numberOfLines).toBeUndefined();
  });

  it('sits in the layout instead of floating over the scroll', () => {
    renderBar();
    const footer = screen.getByTestId('booking.cta').parent?.parent;
    const flat = Object.assign({}, ...[footer?.props.style].flat(Infinity));
    expect(flat.position).toBeUndefined();
  });

  it('shrinks to the CTA while the keyboard is up', () => {
    mockKeyboardVisible = true;
    renderBar();
    expect(screen.queryByText(SUMMARY)).toBeNull();
    expect(screen.queryByText('Nothing to pay')).toBeNull();
    expect(screen.getByText('Request care · EGP 480')).toBeTruthy();
  });
});
