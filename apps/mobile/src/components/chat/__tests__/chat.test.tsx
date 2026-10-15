import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import {
  ChatComposer,
  MessageBubble,
  formatDateDivider,
  groupMessagesByDay,
} from '@mobile/components/chat';

describe('groupMessagesByDay', () => {
  it('starts a new group on each calendar day, keeping order', () => {
    const groups = groupMessagesByDay([
      { id: 1, createdAt: '2026-10-14T09:00:00' },
      { id: 2, createdAt: '2026-10-14T18:00:00' },
      { id: 3, createdAt: '2026-10-15T08:00:00' },
    ]);
    expect(groups.map((g) => g.items.map((m) => m.id))).toEqual([[1, 2], [3]]);
  });
});

describe('formatDateDivider', () => {
  const now = new Date('2026-10-15T12:00:00');
  it('says Today and Yesterday', () => {
    expect(formatDateDivider('2026-10-15T08:00:00', now)).toBe('Today');
    expect(formatDateDivider('2026-10-14T08:00:00', now)).toBe('Yesterday');
  });
});

describe('ChatComposer', () => {
  it('sends only when there is text, and labels the send button', () => {
    const onSend = jest.fn();
    const screen = render(
      <ChatComposer value="" onChangeText={jest.fn()} onSend={onSend} sending={false} />,
    );
    fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).not.toHaveBeenCalled();

    screen.rerender(
      <ChatComposer value="hi" onChangeText={jest.fn()} onSend={onSend} sending={false} />,
    );
    fireEvent.press(screen.getByLabelText('Send message'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

it('renders a bubble with its time', () => {
  const screen = render(<MessageBubble content="On our way" sent time="10:05 AM" />);
  expect(screen.getByText('On our way')).toBeTruthy();
  expect(screen.getByText('10:05 AM')).toBeTruthy();
});
