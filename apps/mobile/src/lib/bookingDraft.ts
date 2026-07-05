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
  nannyRate?: string;
  instructions?: string;
  bookingId?: string;
  retry?: string;
};

export function hasRequiredBookingDraft(params: BookingFlowParams): boolean {
  return !!(
    params.nannyProfileId &&
    params.dateIso &&
    params.startTimeIso &&
    params.endTimeIso
  );
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
    nannyRate: params.nannyRate,
    instructions: params.instructions,
  };
}

export function resolveNannyRate(
  params: BookingFlowParams,
  profileHourlyRate?: number | null,
): number | null {
  if (params.nannyRate) {
    const parsed = Number(params.nannyRate);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  if (profileHourlyRate != null && profileHourlyRate > 0) return profileHourlyRate;
  return null;
}
