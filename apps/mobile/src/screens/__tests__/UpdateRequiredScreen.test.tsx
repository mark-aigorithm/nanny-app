import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import UpdateRequiredScreen from '@mobile/screens/UpdateRequiredScreen';
import { UPDATE_IN_STORE_LABEL } from '@mobile/lib/storeLabels';
import { STATUS_BAR_HEIGHT, spacing } from '@mobile/theme';

describe('UpdateRequiredScreen', () => {
  // The blocker sits in a status-bar-translucent Modal with no header, and the
  // UI sweep caught its icon drawn under the clock on a small phone.
  it('starts its content below the status bar and gives the footer room', () => {
    const { UNSAFE_getByType } = render(<UpdateRequiredScreen releaseNotes="Notes" onUpdate={jest.fn()} />);
    const scroll = UNSAFE_getByType(ScrollView);
    expect(StyleSheet.flatten(scroll.props.style).marginTop).toBe(STATUS_BAR_HEIGHT);
    const content = StyleSheet.flatten(scroll.props.contentContainerStyle);
    expect(content.paddingVertical).toBeGreaterThanOrEqual(spacing.lg);
    expect(screen.getByRole('button', { name: UPDATE_IN_STORE_LABEL })).toBeTruthy();
  });

  it('marks its headline as a header', () => {
    render(<UpdateRequiredScreen releaseNotes={null} onUpdate={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Time to update' })).toBeTruthy();
  });

  // Long centred paragraphs read poorly; short notes stay centred under the headline.
  it('left-aligns long release notes and centres short ones', () => {
    const long = 'Chat with your nanny before a booking starts, see her arrival time live, and pay for extensions in one tap.';
    const { rerender } = render(<UpdateRequiredScreen releaseNotes={long} onUpdate={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByText(long).props.style).textAlign).toBe('left');
    rerender(<UpdateRequiredScreen releaseNotes="Bug fixes." onUpdate={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByText('Bug fixes.').props.style).textAlign).toBe('center');
  });
});
