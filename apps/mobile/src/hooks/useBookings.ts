import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookingResponse,
  CreateBookingRequest,
  MockPayBookingRequest,
} from '@nanny-app/shared';
import { PaymentMethod } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

const BOOKINGS_KEY = 'bookings';

export function useBookingList(statusFilter?: string) {
  return useQuery<BookingResponse[]>({
    queryKey: [BOOKINGS_KEY, statusFilter],
    queryFn: () =>
      unwrap(api.get('/bookings', { params: statusFilter ? { status: statusFilter } : undefined })),
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

export function useAcceptBooking() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, string>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/accept`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation<BookingResponse, Error, string>({
    mutationFn: (id) => unwrap(api.post(`/bookings/${id}/check-out`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [BOOKINGS_KEY] }),
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
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(startIso)} - ${fmt(endIso)}`;
}
