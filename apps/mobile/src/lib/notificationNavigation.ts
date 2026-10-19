import type { Router } from 'expo-router';

import { markSurveyPrompted } from '@mobile/store/surveyPromptStore';

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

/**
 * Every way into a survey (push tap, notifications list, the prompt's Answer)
 * comes through here, so it is marked prompted first: the pending refetch the
 * tap triggers must not then offer the same survey in a sheet over its form.
 */
export function navigateToSurvey(router: Router, surveyId: number): void {
  markSurveyPrompted(surveyId);
  router.push({
    pathname: '/(parent)/survey',
    params: { surveyId: String(surveyId) },
  } as never);
}
