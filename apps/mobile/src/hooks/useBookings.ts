import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookingListQuery,
  BookingResponse,
  CreateBookingRequest,
  MockPayBookingRequest,
} from '@nanny-app/shared';
import { PaymentMethod } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { formatTimeRangeUtc } from '@mobile/lib/formatTime';
import { NANNIES_KEY } from '@mobile/hooks/useNannies';

const BOOKINGS_KEY = 'bookings';

export type BookingListOptions = Pick<BookingListQuery, 'sortBy' | 'sortDir'>;

export function useBookingList(statusFilter?: string, options?: BookingListOptions) {
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
  });
}

export function useBooking(id: string | undefined) {
  return useQuery<BookingResponse>({
    queryKey: [BOOKINGS_KEY, id],
    queryFn: () => unwrap(api.get(`/bookings/${id}`)),
    enabled: !!id,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, CreateBookingRequest>({
    mutationFn: (body) => unwrap(api.post('/bookings', body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
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
    { bookingId: string; method?: MockPayBookingRequest['method'] }
  >({
    mutationFn: ({ bookingId, method = PaymentMethod.CARD }) =>
      unwrap(api.post(`/bookings/${bookingId}/pay/paymob`, { method })),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

export function useSyncPaymobPayment() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, string>({
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
    { id: string; body: MockPayBookingRequest }
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
    { id: string; reason: string }
  >({
    mutationFn: ({ id, reason }) =>
      unwrap(api.post(`/bookings/${id}/cancel`, { reason })),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

/**
 * Nanny's optional accept of a PENDING request. Advisory only — the admin's
 * approval is what confirms the booking; this just records `nannyDecision`.
 */
export function useAcceptBooking() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, string>({
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
  return useMutation<BookingResponse, Error, string>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/decline`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, string>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/check-in`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, string>({
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
  return formatTimeRangeUtc(startIso, endIso);
}
