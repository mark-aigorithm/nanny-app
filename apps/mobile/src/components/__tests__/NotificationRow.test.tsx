import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NotificationResponse } from '@nanny-app/shared';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import NotificationRow from '@mobile/components/NotificationRow';

const NOTIFICATION: NotificationResponse = {
  id: 1,
  type: 'survey',
  title: "We'd love your feedback",
  body: 'How are we doing?',
  isRead: false,
  referenceId: 4,
  referenceType: 'survey',
  createdAt: new Date().toISOString(),
} as NotificationResponse;

describe('NotificationRow', () => {
  // The sweep found "We'd love your f…" on every survey row at 1.3×.
  it('lets the title wrap instead of cutting it off', () => {
    render(<NotificationRow notification={NOTIFICATION} onPress={jest.fn()} />);
    expect(screen.getByText("We'd love your feedback").props.numberOfLines).toBeUndefined();
  });

  it('opens on a tap', () => {
    const onPress = jest.fn();
    render(<NotificationRow notification={NOTIFICATION} onPress={onPress} />);
    fireEvent.press(screen.getByText("We'd love your feedback"));
    expect(onPress).toHaveBeenCalled();
  });
});
