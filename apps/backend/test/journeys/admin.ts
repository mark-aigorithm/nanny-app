/**
 * Admin-side journey steps.
 *
 * Journeys advance the console's half of a flow through the real admin routes —
 * the same deny-by-default permission gate, the same services — so a journey
 * spec reads as the flow ("admin approves, mother pays") rather than as HTTP
 * plumbing. Every helper takes the acting admin's token explicitly: most
 * journeys act as a superuser, but the access-matrix tests pass operators.
 */
import type {
  AdminEditBookingInput,
  AdminRefundBookingInput,
  UpdateBookingTimesInput,
} from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../auth';

/** POSTs (or PATCHes) and unwraps the `{ data }` envelope, failing loudly otherwise. */
async function send(
  token: string,
  method: 'post' | 'patch',
  path: string,
  body?: object,
): Promise<unknown> {
  const response = await request(app)[method](path)
    .set(...authHeader(token))
    .send(body ?? {});

  if (response.status !== 200) {
    throw new Error(
      `${method.toUpperCase()} ${path} failed with ${response.status}: ` +
        JSON.stringify(response.body),
    );
  }

  return response.body.data;
}

// ── Booking lifecycle ─────────────────────────────────────────────

export function approveBooking(token: string, bookingId: number) {
  return send(token, 'post', `/admin/bookings/${bookingId}/approve`);
}

export function rejectBooking(token: string, bookingId: number, reason?: string) {
  return send(
    token,
    'post',
    `/admin/bookings/${bookingId}/reject`,
    reason === undefined ? {} : { reason },
  );
}

export function setBookingStatus(token: string, bookingId: number, status: string) {
  return send(token, 'patch', `/admin/bookings/${bookingId}/status`, { status });
}

export function updateBookingTimes(
  token: string,
  bookingId: number,
  input: UpdateBookingTimesInput,
) {
  return send(token, 'patch', `/admin/bookings/${bookingId}/times`, input);
}

export function previewBookingEdit(
  token: string,
  bookingId: number,
  input: AdminEditBookingInput,
) {
  return send(token, 'post', `/admin/bookings/${bookingId}/edit/preview`, input);
}

export function applyBookingEdit(token: string, bookingId: number, input: object) {
  return send(token, 'post', `/admin/bookings/${bookingId}/edit`, input);
}

export function refundBooking(
  token: string,
  bookingId: number,
  input: AdminRefundBookingInput,
) {
  return send(token, 'post', `/admin/bookings/${bookingId}/refund`, input);
}

// ── Identity review ───────────────────────────────────────────────

/** Approves a mother's ID — the gate `createBooking` checks. Takes the *user* id. */
export function approveMotherId(token: string, motherUserId: number) {
  return send(token, 'post', `/admin/mothers/${motherUserId}/approve`);
}

/** Approves a nanny for the platform. Takes the nanny *profile* id, as the route does. */
export function approveNannyProfile(token: string, nannyProfileId: number) {
  return send(token, 'post', `/admin/nannies/${nannyProfileId}/approve`);
}

// ── Care Points ───────────────────────────────────────────────────

/**
 * Grants (positive) or revokes (negative) points through the real admin route,
 * so the ledger entry and wallet balance move exactly as they would for a
 * console operator — not by writing rows the service never produced.
 */
export function grantCarePoints(
  token: string,
  userId: number,
  points: number,
  reason = 'test grant',
) {
  return send(token, 'post', `/admin/rewards/wallets/${userId}/grant`, { points, reason });
}
