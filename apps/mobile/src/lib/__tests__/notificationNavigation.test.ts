import { isBookingMessagePush, navigateToBookingChat } from '@mobile/lib/notificationNavigation';

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
