import type { BookingResponse } from '@nanny-app/shared';

import { fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { resolveImageUri } from '@mobile/lib/imageUri';

export type BookingFlowParams = {
  nannyProfileId?: string;
  date?: string;
  dateIso?: string;
  startTimeIso?: string;
  endTimeIso?: string;
  nannyName?: string;
  nannyPhoto?: string;
  instructions?: string;
  promoCode?: string;
  /** Comma-separated skill ids the parent selected as paid add-ons. */
  skillIds?: string;
  bookingId?: string;
  retry?: string;
};

export function hasRequiredBookingDraft(params: BookingFlowParams): boolean {
  // Broadcast flow: a request no longer needs a nanny chosen up front — just a
  // date and window. A nanny claims it later.
  return !!(params.dateIso && params.startTimeIso && params.endTimeIso);
}

export function getBookingDateDisplay(params: BookingFlowParams): string {
  if (params.date) return params.date;
  if (params.dateIso) return fmtBookingDate(params.dateIso);
  return '';
}

export function getBookingTimeDisplay(params: BookingFlowParams): string {
  if (!params.startTimeIso || !params.endTimeIso) return '';
  return fmtBookingTime(params.startTimeIso, params.endTimeIso);
}

export function getBookingDurationHours(params: BookingFlowParams): number {
  if (!params.startTimeIso || !params.endTimeIso) return 0;
  return Math.round(
    (new Date(params.endTimeIso).getTime() - new Date(params.startTimeIso).getTime()) / 3_600_000,
  );
}

export function resolveNannyPhoto(
  params: BookingFlowParams,
  profileAvatarUrl?: string | null,
): string | undefined {
  return resolveImageUri(params.nannyPhoto) ?? resolveImageUri(profileAvatarUrl);
}

/** Params needed to reopen checkout for an existing pending booking. */
export function bookingFlowRetryParams(
  params: BookingFlowParams,
  bookingId: string,
): BookingFlowParams {
  return {
    bookingId,
    retry: '1',
    nannyProfileId: params.nannyProfileId,
    date: params.date,
    dateIso: params.dateIso,
    startTimeIso: params.startTimeIso,
    endTimeIso: params.endTimeIso,
    nannyName: params.nannyName,
    nannyPhoto: params.nannyPhoto,
    instructions: params.instructions,
    promoCode: params.promoCode,
  };
}

/**
 * Params for launching the Paymob checkout on an already-created booking
 * (e.g. an APPROVED booking whose payment is now due). Drives the checkout
 * screen in retry/pay mode — no new booking is created.
 */
export function payBookingParams(booking: BookingResponse): BookingFlowParams {
  const nannyName = booking.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`.trim()
    : undefined;
  return {
    bookingId: booking.id,
    retry: '1',
    ...(booking.nannyProfileId ? { nannyProfileId: booking.nannyProfileId } : {}),
    dateIso: booking.date,
    startTimeIso: booking.startTime,
    endTimeIso: booking.endTime,
    ...(nannyName ? { nannyName } : {}),
    ...(booking.nanny?.avatarUrl ? { nannyPhoto: booking.nanny.avatarUrl } : {}),
    ...(booking.specialInstructions ? { instructions: booking.specialInstructions } : {}),
  };
}
