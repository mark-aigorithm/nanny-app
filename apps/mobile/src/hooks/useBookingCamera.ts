import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingCamera, NotifyCameraResponse } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

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

/** Ask the nanny to turn the camera on. The backend enforces a cooldown and
 *  answers 429 when the parent is asking too often. */
export function useNotifyNannyCamera(bookingId: number | undefined) {
  const queryClient = useQueryClient();

  return useMutation<NotifyCameraResponse, unknown, void>({
    mutationFn: () => unwrap(api.post(`/bookings/${bookingId}/camera/notify`)),
    onSuccess: () => {
      // The nanny may switch the camera on within seconds — re-probe rather
      // than leaving a stale "Offline" on screen.
      void queryClient.invalidateQueries({ queryKey: [BOOKING_CAMERA_KEY, bookingId] });
    },
  });
}
