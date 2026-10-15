import type { Router } from 'expo-router';

export function navigateToBookingDetail(
  router: Router,
  bookingId: number,
  options?: { focusCareLog?: boolean },
): void {
  router.push({
    pathname: '/(parent)/book/booking-detail',
    params: {
      bookingId,
      ...(options?.focusCareLog ? { focusCareLog: '1' } : {}),
    },
  } as never);
}

export function shouldFocusCareLogFromPushData(data?: Record<string, string>): boolean {
  return data?.['type'] === 'CARE_LOG_ENTRY' || data?.['focusCareLog'] === '1';
}

export function isBookingMessagePush(data?: Record<string, string>): boolean {
  return data?.['type'] === 'BOOKING_MESSAGE' && !!data['bookingId'];
}

export function navigateToBookingChat(
  router: Router,
  bookingId: number,
  role: 'parent' | 'nanny',
): void {
  router.push({
    pathname: role === 'nanny' ? '/(nanny)/booking-chat' : '/(parent)/book/booking-chat',
    params: { bookingId: String(bookingId) },
  } as never);
}
