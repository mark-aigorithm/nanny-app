import { useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BookingChatSummary,
  BookingMessageListResponse,
  BookingMessageResponse,
  SendBookingMessageRequest,
} from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

export const BOOKING_CHAT_KEY = 'booking-chat';

/** Can she send, how many messages, how many unread — for the entry card. */
export function useBookingChatSummary(bookingId: number | undefined) {
  const isFocused = useIsFocused();
  return useQuery({
    queryKey: [BOOKING_CHAT_KEY, 'summary', bookingId],
    queryFn: () => unwrap<BookingChatSummary>(api.get(`/bookings/${bookingId}/messages/summary`)),
    enabled: !!bookingId,
    refetchInterval: isFocused ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useBookingMessages(bookingId: number | undefined) {
  const isFocused = useIsFocused();
  return useQuery({
    queryKey: [BOOKING_CHAT_KEY, 'messages', bookingId],
    queryFn: () =>
      unwrap<BookingMessageListResponse>(
        api.get(`/bookings/${bookingId}/messages`, { params: { limit: 100 } }),
      ),
    enabled: !!bookingId,
    refetchInterval: isFocused ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useSendBookingMessage(bookingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SendBookingMessageRequest) =>
      unwrap<BookingMessageResponse>(api.post(`/bookings/${bookingId}/messages`, body)),
    onSettled: () => {
      // A refusal (the shift just ended) should also flip the screen to read-only.
      void queryClient.invalidateQueries({ queryKey: [BOOKING_CHAT_KEY] });
    },
  });
}

export function useMarkBookingChatRead(bookingId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap<{ read: true }>(api.post(`/bookings/${bookingId}/messages/read`)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BOOKING_CHAT_KEY, 'summary', bookingId] });
    },
  });
}
