import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import StackHeader from '@mobile/components/ui/stack-header';
import { colors } from '@mobile/theme';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));

/** The header's outer box: the nearest ancestor of the title with a bottom border. */
function header() {
  let node = screen.getByText('Survey').parent;
  while (node && StyleSheet.flatten(node.props.style)?.borderBottomWidth === undefined) node = node.parent;
  return StyleSheet.flatten(node?.props.style);
}

describe('StackHeader', () => {
  // UI-sweep rule: a sticky header shows a hairline once content scrolls under it.
  it('draws a hairline only once content has scrolled under it', () => {
    const { rerender } = render(<StackHeader title="Survey" />);
    expect(header().borderBottomColor).toBe(colors.transparent);
    rerender(<StackHeader title="Survey" scrolled />);
    expect(header().borderBottomColor).toBe(colors.borderSubtle);
    expect(header().borderBottomWidth).toBe(StyleSheet.hairlineWidth);
  });
});
