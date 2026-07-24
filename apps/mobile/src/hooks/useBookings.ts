import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookingListQuery,
  BookingOptions,
  BookingResponse,
  CreateBookingRequest,
  GenerateStartPinResponse,
  MockPayBookingRequest,
  PricingConfig,
  ValidateBookingPromoRequest,
  ValidateBookingPromoResponse,
} from '@nanny-app/shared';
import { PaymentMethod } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { formatBookingTimeRange } from '@mobile/lib/formatTime';
import { NANNIES_KEY } from '@mobile/hooks/useNannies';

const BOOKINGS_KEY = 'bookings';

export type BookingListOptions = Pick<BookingListQuery, 'sortBy' | 'sortDir'>;

export function useBookingList(
  statusFilter?: string,
  options?: BookingListOptions,
  refetchIntervalMs?: number,
  enabled = true,
) {
  return useQuery<BookingResponse[]>({
    queryKey: [BOOKINGS_KEY, statusFilter, options?.sortBy, options?.sortDir],
    queryFn: () =>
      unwrap(
        api.get('/bookings', {
          params: {
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(options?.sortBy ? { sortBy: options.sortBy } : {}),
            ...(options?.sortDir ? { sortDir: options.sortDir } : {}),
          },
        }),
      ),
    enabled,
    ...(refetchIntervalMs ? { refetchInterval: refetchIntervalMs } : {}),
  });
}

export function useBooking(id: number | undefined, pollWhilePending = false) {
  return useQuery<BookingResponse>({
    queryKey: [BOOKINGS_KEY, id],
    queryFn: () => unwrap(api.get(`/bookings/${id}`)),
    enabled: !!id,
    // While a broadcast request is unclaimed, poll so the screen advances on its
    // own the moment a nanny accepts (PENDING → APPROVED).
    refetchInterval: pollWhilePending
      ? (query) => (query.state.data?.status === 'PENDING' ? 5000 : false)
      : undefined,
  });
}

/** Apply Care Points to an approved booking before payment (lowers the total). */
export function useRedeemBookingPoints() {
  const queryClient = useQueryClient();
  return useMutation<BookingResponse, Error, { id: number; hours: number }>({
    mutationFn: ({ id, hours }) => unwrap(api.post(`/bookings/${id}/redeem-points`, { hours })),
    onSuccess: (booking) => {
      queryClient.setQueryData([BOOKINGS_KEY, booking.id], booking);
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
    },
  });
}

/** Remove/refund Care Points applied to a booking (also used on payment failure). */
export function useRefundBookingPoints() {
  const queryClient = useQueryClient();
  return useMutation<BookingResponse, Error, number>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/redeem-points/refund`)),
    onSuccess: (booking) => {
      queryClient.setQueryData([BOOKINGS_KEY, booking.id], booking);
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
    },
  });
}

/**
 * The open broadcast pool a nanny can claim: unassigned PENDING requests she is
 * eligible for. First nanny to accept wins.
 */
export function useAvailableBookings(enabled = true) {
  return useQuery<BookingResponse[]>({
    queryKey: [BOOKINGS_KEY, 'available'],
    queryFn: () => unwrap(api.get('/bookings/available')),
    enabled,
  });
}

/**
 * Fixed platform hourly rate + service fee % used to show a live price estimate
 * on the booking form (the mother no longer picks a nanny, so the rate comes
 * from platform config, not a profile).
 */
export function usePricingConfig() {
  return useQuery<PricingConfig>({
    queryKey: ['pricing-config'],
    queryFn: () => unwrap(api.get('/bookings/pricing')),
    staleTime: 5 * 60_000,
  });
}

/**
 * The scheduling rules the date/time picker needs: the daily booking window, the
 * duration limits, and the earliest start the minimum advance notice allows.
 *
 * Short staleTime with a refetch on focus because `earliestStartWallClock` is a
 * point in time and goes off — a parent who leaves the picker open would
 * otherwise be offered a slot that has since fallen inside the lead time. The
 * server re-checks on submit regardless, so the worst case is a rejected
 * booking, not a wrong one.
 */
export function useBookingOptions() {
  return useQuery<BookingOptions>({
    queryKey: ['booking-options'],
    queryFn: () => unwrap(api.get('/bookings/options')),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, CreateBookingRequest>({
    mutationFn: (body) => unwrap(api.post('/bookings', body)),
    onSuccess: (booking) => {
      // Seed the detail cache with the booking we were just handed. The
      // confirmation screen navigates straight here after submitting, and
      // without this it would mount with no data and flash a bare spinner
      // before its own fetch resolved.
      qc.setQueryData([BOOKINGS_KEY, booking.id], booking);
      void qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] });
    },
  });
}

export function useValidatePromo() {
  return useMutation<ValidateBookingPromoResponse, Error, ValidateBookingPromoRequest>({
    mutationFn: (body) => unwrap(api.post('/bookings/validate-promo', body)),
  });
}

export type PaymobCheckoutSession = {
  paymentId: string;
  clientSecret: string;
  publicKey: string;
  intentionId: string;
};

export function usePaymobCheckout() {
  const qc = useQueryClient();
  return useMutation<
    PaymobCheckoutSession,
    Error,
    { bookingId: number; method?: MockPayBookingRequest['method'] }
  >({
    mutationFn: ({ bookingId, method = PaymentMethod.CARD }) =>
      unwrap(api.post(`/bookings/${bookingId}/pay/paymob`, { method })),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

export function useSyncPaymobPayment() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, number>({
    mutationFn: (bookingId) => unwrap(api.post(`/bookings/${bookingId}/pay/paymob/sync`)),
    onSuccess: (booking) => {
      qc.setQueryData([BOOKINGS_KEY, booking.id], booking);
      qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] });
    },
  });
}

export function useMockPay() {
  const qc = useQueryClient();
  return useMutation<
    { booking: BookingResponse; payment: object },
    Error,
    { id: number; body: MockPayBookingRequest }
  >({
    mutationFn: ({ id, body }) =>
      unwrap(api.post(`/bookings/${id}/pay`, body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation<
    { booking: BookingResponse; refundAmount: number },
    Error,
    { id: number; reason: string }
  >({
    mutationFn: ({ id, reason }) =>
      unwrap(api.post(`/bookings/${id}/cancel`, { reason })),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

/**
 * Nanny claims an unassigned request. First to accept wins: this assigns the
 * nanny and moves the booking to APPROVED (payable) so the parent can pay.
 */
export function useAcceptBooking() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, number>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/accept`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

/**
 * Nanny's optional decline of a PENDING request. Advisory only — does not
 * change the booking status, just records `nannyDecision = DECLINED`.
 */
export function useDeclineBooking() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, number>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/decline`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

/**
 * Parent reveals the 4-digit start PIN for a booking within the check-in window.
 * The plaintext PIN is only ever returned here — never on the booking itself.
 */
export function useGenerateStartPin() {
  const qc = useQueryClient();
  return useMutation<GenerateStartPinResponse, Error, number>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/start-pin`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, { id: number; pin: string }>({
    mutationFn: ({ id, pin }) => unwrap(api.post(`/bookings/${id}/check-in`, { pin })),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, number>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/check-out`)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] });
      // Ending a shift completes the booking — refresh the nanny dashboard
      // so the new earnings show up immediately.
      void qc.invalidateQueries({ queryKey: [NANNIES_KEY, 'dashboard'] });
    },
  });
}

// Helper to create the mock pay body for demo purposes
export const DEMO_PAY_BODY: MockPayBookingRequest = {
  method: PaymentMethod.CARD,
  succeed: true,
};

// Format helpers used across booking screens
export function fmtBookingDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export function fmtBookingTime(startIso: string, endIso: string): string {
  return formatBookingTimeRange(startIso, endIso);
}
