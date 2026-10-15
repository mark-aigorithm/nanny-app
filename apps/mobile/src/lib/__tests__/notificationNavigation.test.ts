import {
  bookingChatRoleFor,
  isBookingMessagePush,
  navigateToBookingChat,
} from '@mobile/lib/notificationNavigation';

it('recognises a booking chat push', () => {
  expect(isBookingMessagePush({ type: 'BOOKING_MESSAGE', bookingId: '7' })).toBe(true);
  expect(isBookingMessagePush({ type: 'CARE_LOG_ENTRY', bookingId: '7' })).toBe(false);
  expect(isBookingMessagePush(undefined)).toBe(false);
});

it('opens the chat route for each role', () => {
  const router = { push: jest.fn() };
  navigateToBookingChat(router as never, 7, 'parent');
  navigateToBookingChat(router as never, 7, 'nanny');
  expect(router.push).toHaveBeenNthCalledWith(1, {
    pathname: '/(parent)/book/booking-chat',
    params: { bookingId: '7' },
  });
  expect(router.push).toHaveBeenNthCalledWith(2, {
    pathname: '/(nanny)/booking-chat',
    params: { bookingId: '7' },
  });
});

describe('bookingChatRoleFor', () => {
  it('follows the route group the app is in', () => {
    expect(bookingChatRoleFor(['(nanny)', 'dashboard'], 'MOTHER')).toBe('nanny');
    expect(bookingChatRoleFor(['(parent)', '(tabs)', 'home'], 'NANNY')).toBe('parent');
  });

  it('falls back to her role on a cold start, before any group is mounted', () => {
    expect(bookingChatRoleFor([], 'NANNY')).toBe('nanny');
    expect(bookingChatRoleFor([], 'MOTHER')).toBe('parent');
    expect(bookingChatRoleFor([], undefined)).toBe('parent');
  });
});
