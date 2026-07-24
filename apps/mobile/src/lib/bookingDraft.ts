import type { BookingResponse } from '@nanny-app/shared';

import { fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { resolveImageUri } from '@mobile/lib/imageUri';

export type BookingFlowParams = {
  nannyProfileId?: string;
  date?: string;
  dateIso?: string;
  /**
   * Platform wall-clock, "2026-07-20T09:00:00" — never carries an offset. Named
   * for the format so it stays obvious that these go straight to the API, which
   * expects wall-clock and does the timezone conversion itself.
   */
  startTimeWall?: string;
  endTimeWall?: string;
  /** Carried from the picker, which already knows it. */
  durationHours?: string;
  nannyName?: string;
  nannyPhoto?: string;
  instructions?: string;
  promoCode?: string;
  /** Comma-separated skill ids the parent selected as paid add-ons. */
  skillIds?: string;
  /**
   * Free hours the parent reserved with Care Points on the review step. Points
   * can only be redeemed against a booking that exists, so this rides through
   * the flow and is applied on the confirmation screen once a nanny accepts.
   */
  pointsHours?: string;
  bookingId?: string;
  retry?: string;
};

export function hasRequiredBookingDraft(params: BookingFlowParams): boolean {
  // Broadcast flow: a request no longer needs a nanny chosen up front — just a
  // date and window. A nanny claims it later.
  return !!(params.dateIso && params.startTimeWall && params.endTimeWall);
}

export function getBookingDateDisplay(params: BookingFlowParams): string {
  if (params.date) return params.date;
  if (params.dateIso) return fmtBookingDate(params.dateIso);
  return '';
}

export function getBookingTimeDisplay(params: BookingFlowParams): string {
  if (!params.startTimeWall || !params.endTimeWall) return '';
  return fmtBookingTime(params.startTimeWall, params.endTimeWall);
}

export function getBookingDurationHours(params: BookingFlowParams): number {
  // Carried through from the picker rather than recomputed. Subtracting two
  // wall-clock strings via Date parses them in the DEVICE's timezone, which
  // gives the wrong answer if that timezone has a DST jump inside the window.
  return params.durationHours ? Number(params.durationHours) : 0;
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
  bookingId: number,
): BookingFlowParams {
  return {
    bookingId: String(bookingId),
    retry: '1',
    nannyProfileId: params.nannyProfileId,
    date: params.date,
    dateIso: params.dateIso,
    startTimeWall: params.startTimeWall,
    endTimeWall: params.endTimeWall,
    durationHours: params.durationHours,
    nannyName: params.nannyName,
    nannyPhoto: params.nannyPhoto,
    instructions: params.instructions,
    promoCode: params.promoCode,
    pointsHours: params.pointsHours,
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
    bookingId: String(booking.id),
    retry: '1',
    ...(booking.nannyProfileId ? { nannyProfileId: String(booking.nannyProfileId) } : {}),
    dateIso: booking.date,
    // The API sends "…T09:00:00+03:00"; drop the offset so this field holds one
    // format regardless of whether it came from the picker or from a booking.
    startTimeWall: booking.startTime.slice(0, 19),
    endTimeWall: booking.endTime.slice(0, 19),
    durationHours: String(booking.durationHours),
    ...(nannyName ? { nannyName } : {}),
    ...(booking.nanny?.avatarUrl ? { nannyPhoto: booking.nanny.avatarUrl } : {}),
    ...(booking.specialInstructions ? { instructions: booking.specialInstructions } : {}),
  };
}
