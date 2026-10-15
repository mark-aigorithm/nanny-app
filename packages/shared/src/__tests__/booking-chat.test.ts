import { describe, expect, it } from 'vitest';

import {
  BOOKING_MESSAGE_MAX_LENGTH,
  BookingMessageHistoryQuerySchema,
  NotificationTypeSchema,
  SendBookingMessageSchema,
} from '../index';

describe('SendBookingMessageSchema', () => {
  it('trims the message', () => {
    expect(SendBookingMessageSchema.parse({ content: '  On our way  ' })).toEqual({
      content: 'On our way',
    });
  });

  it('refuses an empty or whitespace-only message', () => {
    expect(SendBookingMessageSchema.safeParse({ content: '' }).success).toBe(false);
    expect(SendBookingMessageSchema.safeParse({ content: '   \n ' }).success).toBe(false);
  });

  it('caps the length', () => {
    const max = 'a'.repeat(BOOKING_MESSAGE_MAX_LENGTH);
    expect(SendBookingMessageSchema.safeParse({ content: max }).success).toBe(true);
    expect(SendBookingMessageSchema.safeParse({ content: `${max}a` }).success).toBe(false);
  });
});

describe('BookingMessageHistoryQuerySchema', () => {
  it('defaults the page size and coerces it from the query string', () => {
    expect(BookingMessageHistoryQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(BookingMessageHistoryQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(BookingMessageHistoryQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

it('knows the booking_message notification type', () => {
  expect(NotificationTypeSchema.parse('booking_message')).toBe('booking_message');
});
