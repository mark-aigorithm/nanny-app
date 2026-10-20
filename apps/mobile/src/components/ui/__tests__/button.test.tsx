import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import Button from '@mobile/components/ui/button';
import { colors } from '@mobile/theme';

// The icon font loads asynchronously and would set state outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

/** WCAG relative-luminance contrast of two opaque #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function rendered(title: string) {
  const button = screen.getByRole('button', { name: title });
  const style = StyleSheet.flatten(button.props.style);
  const label = StyleSheet.flatten(screen.getByText(title).props.style);
  return { style, label };
}

describe('Button', () => {
  // UI-sweep rule: "An enabled button never looks disabled … at least 4.5:1".
  it('gives the enabled primary label at least 4.5:1 on its fill', () => {
    render(<Button title="Submit" onPress={() => undefined} />);
    const { style, label } = rendered('Submit');
    expect(style.opacity ?? 1).toBe(1);
    expect(contrast(label.color as string, style.backgroundColor as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('draws a disabled primary with its own fill and label, not a faded enabled one', () => {
    render(<Button title="Submit" disabled onPress={() => undefined} />);
    const { style, label } = rendered('Submit');
    expect(style.backgroundColor).toBe(colors.actionDisabled);
    expect(label.color).toBe(colors.onActionDisabled);
    expect(style.backgroundColor).not.toBe(colors.primaryAction);
    expect(style.opacity ?? 1).toBe(1);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('gives the outline label at least 4.5:1 on the cream page', () => {
    render(<Button title="Back" variant="outline" onPress={() => undefined} />);
    const { label } = rendered('Back');
    expect(contrast(label.color as string, colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  // While loading the label is replaced by a spinner; the name must survive.
  it('keeps its accessible name while loading', () => {
    render(<Button title="Submit" loading onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
  });
});
