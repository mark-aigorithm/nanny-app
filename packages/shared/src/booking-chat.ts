import { z } from 'zod';

/** Longest booking chat message, in characters. */
export const BOOKING_MESSAGE_MAX_LENGTH = 2000;

export const BookingMessageSenderSchema = z.object({
  id: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  /** Which side of the booking sent it — the console colours by this. */
  role: z.enum(['MOTHER', 'NANNY']),
});
export type BookingMessageSender = z.infer<typeof BookingMessageSenderSchema>;

export const BookingMessageResponseSchema = z.object({
  id: z.number().int(),
  bookingId: z.number().int(),
  content: z.string(),
  sender: BookingMessageSenderSchema,
  createdAt: z.string(),
});
export type BookingMessageResponse = z.infer<typeof BookingMessageResponseSchema>;

/** One page of a booking's chat, oldest first within the page. */
export const BookingMessageListResponseSchema = z.object({
  messages: z.array(BookingMessageResponseSchema),
  hasMore: z.boolean(),
});
export type BookingMessageListResponse = z.infer<typeof BookingMessageListResponseSchema>;

export const BookingMessageHistoryQuerySchema = z.object({
  /** Return messages created before this instant (the oldest one already shown). */
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type BookingMessageHistoryQuery = z.infer<typeof BookingMessageHistoryQuerySchema>;

export const SendBookingMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(BOOKING_MESSAGE_MAX_LENGTH, `Keep it under ${BOOKING_MESSAGE_MAX_LENGTH} characters`),
});
export type SendBookingMessageRequest = z.infer<typeof SendBookingMessageSchema>;

/** What a booking detail screen needs to show the chat entry. */
export const BookingChatSummarySchema = z.object({
  /** True only while the booking is IN_PROGRESS. */
  canSend: z.boolean(),
  messageCount: z.number().int(),
  /** Messages from the other participant since the caller last read the chat. */
  unreadCount: z.number().int(),
});
export type BookingChatSummary = z.infer<typeof BookingChatSummarySchema>;
