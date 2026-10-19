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

/**
 * Which app a chat push opens in: the route group she is in, or — on a cold
 * start, before the root gate has mounted either group — her profile's role.
 */
export function bookingChatRoleFor(
  segments: readonly string[],
  profileRole: string | null | undefined,
): 'parent' | 'nanny' {
  if (segments[0] === '(nanny)') return 'nanny';
  if (segments[0] === '(parent)') return 'parent';
  return profileRole === 'NANNY' ? 'nanny' : 'parent';
}

export function isSurveyPush(data?: Record<string, string>): boolean {
  if (data?.['type'] !== 'SURVEY') return false;
  const id = Number(data['surveyId']);
  return Number.isInteger(id) && id > 0;
}

export function navigateToSurvey(router: Router, surveyId: number): void {
  router.push({
    pathname: '/(parent)/survey',
    params: { surveyId: String(surveyId) },
  } as never);
}
