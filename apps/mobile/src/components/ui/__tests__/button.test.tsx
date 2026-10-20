import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import Button from '@mobile/components/ui/button';
import { colors } from '@mobile/theme';
import { contrastRatio as contrast } from '@mobile/theme/contrast';

// The icon font loads asynchronously and would set state outside act().
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

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

  // Forms pass `disabled` and `loading` together while submitting; that is
  // "busy", not "unavailable", so it keeps the enabled fill.
  it('keeps the enabled primary fill while loading, even when also disabled', () => {
    render(<Button title="Save" disabled loading onPress={() => undefined} />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Save' }).props.style);
    expect(style.backgroundColor).toBe(colors.primaryAction);
    expect(style.opacity ?? 1).toBe(1);
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
