import type { Router } from 'expo-router';

export function navigateToBookingDetail(
  router: Router,
  bookingId: string,
  options?: { focusCareLog?: boolean },
): void {
  router.push({
    pathname: '/(parent)/book/booking-detail',
    params: {
      bookingId,
      returnTo: 'bookings',
      ...(options?.focusCareLog ? { focusCareLog: '1' } : {}),
    },
  } as never);
}

export function shouldFocusCareLogFromPushData(data?: Record<string, string>): boolean {
  return data?.['type'] === 'CARE_LOG_ENTRY' || data?.['focusCareLog'] === '1';
}
