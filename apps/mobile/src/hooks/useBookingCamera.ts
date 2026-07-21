import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingCamera, NotifyCameraResponse } from '@nanny-app/shared';

import { api, getApiErrorMessage, unwrap } from '@mobile/lib/api';

const BOOKING_CAMERA_KEY = 'booking-camera';

/**
 * Live camera feed for an in-progress booking.
 *
 * The backend only serves this while the booking is IN_PROGRESS and only to
 * the booking's parent, so a 403/404 here is an expected outcome rather than a
 * bug — the screen renders it as an empty state.
 */
export function useBookingCamera(bookingId: number | undefined) {
  return useQuery<BookingCamera>({
    queryKey: [BOOKING_CAMERA_KEY, bookingId],
    queryFn: () => unwrap(api.get(`/bookings/${bookingId}/camera`)),
    enabled: !!bookingId,
    // The online flag comes from a reachability probe that the backend caches
    // for 15s. Re-checking every 30s keeps the status dot honest without
    // hammering the camera.
    refetchInterval: 30_000,
    retry: false,
  });
}

/** Thrown by the notify mutation so callers can tell "already asked" apart from
 *  a genuine failure. `unwrap` flattens everything to a plain Error, which
 *  would leave the screen unable to distinguish the two. */
export class NotifyCameraError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status: number | undefined) {
    super(message);
    this.name = 'NotifyCameraError';
    this.status = status;
  }

  /** The backend refused because the nanny was nudged too recently. */
  get isCooldown(): boolean {
    return this.status === 429;
  }
}

/** Ask the nanny to turn the camera on. The backend enforces a cooldown and
 *  answers 429 when the parent is asking too often. */
export function useNotifyNannyCamera(bookingId: number | undefined) {
  const queryClient = useQueryClient();

  return useMutation<NotifyCameraResponse, NotifyCameraError, void>({
    // Deliberately not using `unwrap` here: it collapses axios errors into a
    // plain Error, losing the status code this screen needs to distinguish
    // "already asked" from "the request actually failed".
    mutationFn: async () => {
      try {
        const res = await api.post<{ data: NotifyCameraResponse | null; error: string | null }>(
          `/bookings/${bookingId}/camera/notify`,
        );
        if (res.data.error || res.data.data === null) {
          throw new NotifyCameraError(
            res.data.error ?? 'Something went wrong. Please try again.',
            res.status,
          );
        }
        return res.data.data;
      } catch (err) {
        if (err instanceof NotifyCameraError) throw err;
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        throw new NotifyCameraError(getApiErrorMessage(err), status);
      }
    },
    onSuccess: () => {
      // The nanny may switch the camera on within seconds — re-probe rather
      // than leaving a stale "Offline" on screen.
      void queryClient.invalidateQueries({ queryKey: [BOOKING_CAMERA_KEY, bookingId] });
    },
  });
}
