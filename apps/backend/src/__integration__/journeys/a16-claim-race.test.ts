/**
 * A16 — first to accept wins, and what "decline" means for a broadcast.
 *
 * A request is claimed by whichever nanny accepts first. The guard is a
 * status-conditioned `updateMany` inside the claim transaction, so the
 * database — not application code — guarantees exactly one winner, even when
 * two accepts arrive at the same instant. That is only provable against real
 * Postgres, which is why this is an integration journey.
 *
 * Decline is narrower than the word suggests: an unclaimed request is nobody's
 * to decline (you simply don't claim it), so the route refuses and the request
 * stays open. Once a booking is assigned to her, a decline is recorded as her
 * decision and nothing else moves — the mother still has her nanny.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny } from '../../../test/factories';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';

function accept(nannyToken: string, bookingId: number) {
  return request(app).post(`/bookings/${bookingId}/accept`).set(...authHeader(nannyToken));
}

function decline(nannyToken: string, bookingId: number) {
  return request(app).post(`/bookings/${bookingId}/decline`).set(...authHeader(nannyToken));
}

async function reload(id: number) {
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

describe('A16 — first to accept wins', () => {
  it('refuses a second nanny once the request is claimed, and keeps the first', async () => {
    const mother = await makeMother();
    const first = await makeNanny();
    const second = await makeNanny();

    const booking = await createBookingViaApi(mother.token);
    await claimBooking(first.token, booking.id);

    const late = await accept(second.token, booking.id);
    expect(late.status).toBe(400);
    expect(late.body.error).toMatch(/no longer awaiting a nanny/i);

    const row = await reload(booking.id);
    expect(row.status).toBe('APPROVED');
    expect(row.nannyProfileId).toBe(first.nannyProfileId);

    // It has left the second nanny's pool.
    const pool = await request(app).get('/bookings/available').set(...authHeader(second.token));
    expect((pool.body.data as Array<{ id: number }>).map((b) => b.id)).not.toContain(booking.id);
  });

  it('lets exactly one of two simultaneous accepts through', async () => {
    const mother = await makeMother();
    const nannies = await Promise.all([makeNanny(), makeNanny()]);

    const booking = await createBookingViaApi(mother.token);

    // Both requests are in flight at once. Each transaction reads a PENDING
    // row; the row lock serialises the two guarded writes, and the loser's
    // re-evaluated WHERE matches nothing.
    const results = await Promise.all(nannies.map((n) => accept(n.token, booking.id)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);

    const loser = results.find((r) => r.status === 409);
    expect(loser?.body.error).toMatch(/already accepted by another nanny/i);

    const row = await reload(booking.id);
    const winner = results.findIndex((r) => r.status === 200);
    expect(row.status).toBe('APPROVED');
    expect(row.nannyProfileId).toBe(nannies[winner]?.nannyProfileId);

    // One claim, one prompt to pay.
    const prompts = await prisma.notification.count({
      where: { userId: mother.id, type: 'BOOKING_APPROVED', referenceId: booking.id },
    });
    expect(prompts).toBe(1);
  });
});

describe('A16 — decline', () => {
  it('is refused on an unclaimed request, which stays open to everyone else', async () => {
    const mother = await makeMother();
    const decliner = await makeNanny();
    const other = await makeNanny();

    const booking = await createBookingViaApi(mother.token);

    const refused = await decline(decliner.token, booking.id);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/not assigned to you/i);

    const row = await reload(booking.id);
    expect(row.status).toBe('PENDING');
    expect(row.nannyProfileId).toBeNull();
    expect(row.nannyDecision).toBe('PENDING');

    // Nothing changed for the mother or the other nanny.
    const pool = await request(app).get('/bookings/available').set(...authHeader(other.token));
    expect((pool.body.data as Array<{ id: number }>).map((b) => b.id)).toContain(booking.id);
    await claimBooking(other.token, booking.id);
  });

  it('is recorded on a booking assigned to her without moving its status', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const stranger = await makeNanny();

    // A booking routed to her directly, still awaiting her answer.
    const booking = await createBookingViaApi(mother.token);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { nannyProfileId: nanny.nannyProfileId },
    });

    // Somebody else's booking is not hers to answer.
    expect((await decline(stranger.token, booking.id)).status).toBe(403);

    const declined = await decline(nanny.token, booking.id);
    expect(declined.status).toBe(200);

    const row = await reload(booking.id);
    expect(row.nannyDecision).toBe('DECLINED');
    expect(row.nannyDecidedAt).not.toBeNull();
    expect(row.status).toBe('PENDING');
    expect(row.nannyProfileId).toBe(nanny.nannyProfileId);
  });
});
