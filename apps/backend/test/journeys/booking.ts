/**
 * Mother- and nanny-side journey steps.
 *
 * Bookings are created through `POST /bookings` exactly as the app does —
 * broadcast, then claimed by a nanny — so the journey exercises the pricing
 * engine, the platform window and the lead-time rule rather than sidestepping
 * them with a factory row. The one deliberate shim is `shiftWindowToNow`:
 * check-in opens 15 minutes before start, but a bookable start is at least the
 * lead-time away, so tests that need the in-care segment move the already-paid
 * booking's window over "now" instead of waiting hours of wall-clock time.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../auth';

/**
 * Tomorrow at the given hour as a platform wall-clock string
 * (`YYYY-MM-DDTHH:mm:ss`, no offset). Tomorrow 10:00–14:00 is always bookable:
 * beyond the 2-hour lead time and inside the 06:00–22:00 window.
 */
export function wallClockTomorrow(hour: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  const day = date.toISOString().slice(0, 10);
  return `${day}T${String(hour).padStart(2, '0')}:00:00`;
}

export type CreateBookingOptions = {
  startHour?: number;
  durationHours?: number;
  promoCode?: string;
  usePackageHours?: boolean;
  skillIds?: number[];
  children?: Array<{ name: string | null; ageYears: number; allergies: string | null }>;
};

/** One three-year-old with no allergies — the smallest valid `children` array. */
const DEFAULT_CHILDREN = [{ name: 'Test Child', ageYears: 3, allergies: null }];

export type CreatedBooking = {
  id: number;
  status: string;
  totalAmount: number;
  [key: string]: unknown;
};

/** Broadcasts a booking request as the mother. */
export async function createBookingViaApi(
  motherToken: string,
  options: CreateBookingOptions = {},
): Promise<CreatedBooking> {
  const { startHour = 10, durationHours = 4, children = DEFAULT_CHILDREN, ...rest } = options;

  const response = await request(app)
    .post('/bookings')
    .set(...authHeader(motherToken))
    .send({
      startTime: wallClockTomorrow(startHour),
      endTime: wallClockTomorrow(startHour + durationHours),
      children,
      ...rest,
    });

  if (response.status !== 201) {
    throw new Error(`POST /bookings failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.data as CreatedBooking;
}

/** The nanny claims (or, once assigned, accepts) the broadcast request. */
export async function claimBooking(nannyToken: string, bookingId: number): Promise<unknown> {
  const response = await request(app)
    .post(`/bookings/${bookingId}/accept`)
    .set(...authHeader(nannyToken));

  if (response.status !== 200) {
    throw new Error(`Claiming booking ${bookingId} failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.data;
}

/**
 * Moves a booking's window so it contains "now" (started 5 minutes ago, ends
 * in `durationHours`). The check-in clock gate reads these columns, so this is
 * the narrowest possible time shim — nothing else about the booking changes.
 */
export async function shiftWindowToNow(bookingId: number, durationHours = 4): Promise<void> {
  const now = Date.now();
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      startTime: new Date(now - 5 * 60_000),
      endTime: new Date(now + durationHours * 3_600_000),
    },
  });
}

/** Parent reveals the start PIN; nanny checks in with it. Returns the booking. */
export async function checkIn(
  motherToken: string,
  nannyToken: string,
  bookingId: number,
): Promise<unknown> {
  const pinResponse = await request(app)
    .post(`/bookings/${bookingId}/start-pin`)
    .set(...authHeader(motherToken));
  if (pinResponse.status !== 200) {
    throw new Error(`start-pin failed with ${pinResponse.status}: ${JSON.stringify(pinResponse.body)}`);
  }
  const { pin } = pinResponse.body.data as { pin: string };

  const checkInResponse = await request(app)
    .post(`/bookings/${bookingId}/check-in`)
    .set(...authHeader(nannyToken))
    .send({ pin });
  if (checkInResponse.status !== 200) {
    throw new Error(`check-in failed with ${checkInResponse.status}: ${JSON.stringify(checkInResponse.body)}`);
  }

  return checkInResponse.body.data;
}

export async function checkOut(nannyToken: string, bookingId: number): Promise<unknown> {
  const response = await request(app)
    .post(`/bookings/${bookingId}/check-out`)
    .set(...authHeader(nannyToken));
  if (response.status !== 200) {
    throw new Error(`check-out failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body.data;
}

/** Mother reviews a completed booking. */
export async function submitReview(
  motherToken: string,
  bookingId: number,
  rating: number,
  comment?: string,
): Promise<unknown> {
  const response = await request(app)
    .post(`/nanny/bookings/${bookingId}/review`)
    .set(...authHeader(motherToken))
    .send({ rating, ...(comment === undefined ? {} : { comment }) });

  if (response.status !== 201) {
    throw new Error(`Review failed with ${response.status}: ${JSON.stringify(response.body)}`);
  }

  return response.body.data;
}
