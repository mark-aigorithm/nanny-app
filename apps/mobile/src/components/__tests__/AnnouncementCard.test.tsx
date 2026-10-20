import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { NotificationResponse } from '@nanny-app/shared';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import AnnouncementCard from '@mobile/components/AnnouncementCard';

function announcement(overrides: Partial<NotificationResponse> = {}): NotificationResponse {
  return {
    id: 7,
    type: 'announcement',
    title: 'Spring offer',
    body: 'Book any day this week and we take 20% off. The code is applied for you.',
    isRead: false,
    referenceId: null,
    referenceType: null,
    createdAt: new Date().toISOString(),
    imageUrl: 'https://cdn.example.com/spring.jpg',
    link: { type: 'promo_code', code: 'SAVE20' },
    ...overrides,
  };
}

describe('AnnouncementCard', () => {
  it('is one button labelled with the title and what tapping does', () => {
    render(<AnnouncementCard notification={announcement()} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Spring offer. Book with code SAVE20' })).toBeTruthy();
    // The code stays on the line with "code" at any font scale.
    expect(screen.getByText('Book with code SAVE20')).toBeTruthy();
  });

  it('says "View package" for a package link', () => {
    render(
      <AnnouncementCard
        notification={announcement({ link: { type: 'package', packageId: 3 } })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Spring offer. View package' })).toBeTruthy();
  });

  it('has no action line and a title-only label without a link', () => {
    render(<AnnouncementCard notification={announcement({ link: null })} onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Spring offer' })).toBeTruthy();
    expect(screen.queryByText(/Book with code|View package/)).toBeNull();
  });

  it('shows the whole body, never truncated', () => {
    render(<AnnouncementCard notification={announcement()} onPress={jest.fn()} />);
    const body = screen.getByText(/Book any day this week/);
    expect(body.props.numberOfLines).toBeUndefined();
  });

  it('draws the image in a fixed 2:1 box hidden from screen readers', () => {
    render(<AnnouncementCard notification={announcement()} onPress={jest.fn()} />);
    expect(screen.queryByTestId('announcement.image')).toBeNull();
    const box = screen.getByTestId('announcement.image', { includeHiddenElements: true });
    expect(box).toHaveStyle({ aspectRatio: 2 });
  });

  it('leaves the image box out when there is no image', () => {
    render(<AnnouncementCard notification={announcement({ imageUrl: null })} onPress={jest.fn()} />);
    expect(screen.queryByTestId('announcement.image', { includeHiddenElements: true })).toBeNull();
  });

  it('right-aligns an Arabic body', () => {
    const arabic = 'أضفنا مربيات جديدات في منطقتك هذا الأسبوع.';
    render(<AnnouncementCard notification={announcement({ body: arabic })} onPress={jest.fn()} />);
    expect(screen.getByText(arabic)).toHaveStyle({ textAlign: 'right', writingDirection: 'rtl' });
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<AnnouncementCard notification={announcement()} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is memoised', () => {
    expect((AnnouncementCard as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});
