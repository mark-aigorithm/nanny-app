/**
 * A19 — a review moves the nanny's rating.
 *
 * The rating a family sees on a nanny is a denormalised average kept on her
 * profile and recomputed inside the same transaction as each review. A1 proves
 * one review lands; this proves the arithmetic — count and average across
 * several — and that it is what the public profile reports. The rules around
 * who may review what (one per booking, completed bookings only, the booking's
 * own mother) are asserted here too, since each one protects that average.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeBooking, makeMother, makeNanny } from '../../../test/factories';
import { submitReview } from '../../../test/journeys/booking';

async function profileOf(nannyProfileId: number) {
  return prisma.nannyProfile.findUniqueOrThrow({ where: { id: nannyProfileId } });
}

/** The profile as a mother browsing the app sees it. */
async function publicProfile(viewerToken: string, nannyProfileId: number) {
  const response = await request(app)
    .get(`/nanny/nannies/${nannyProfileId}`)
    .set(...authHeader(viewerToken));
  expect(response.status).toBe(200);
  return response.body.data as { rating: number; reviewCount: number };
}

function review(token: string, bookingId: number, rating: number) {
  return request(app)
    .post(`/nanny/bookings/${bookingId}/review`)
    .set(...authHeader(token))
    .send({ rating });
}

describe('A19 — the rating average', () => {
  it('counts every review and averages them', async () => {
    const nanny = await makeNanny();
    const first = await makeMother();
    const second = await makeMother();

    // Two families, two completed bookings, on different days so they cannot overlap.
    const dayAfter = new Date();
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
    dayAfter.setUTCHours(0, 0, 0, 0);
    const bookingA = await makeBooking({
      motherId: first.id,
      nannyProfileId: nanny.nannyProfileId,
      status: 'COMPLETED',
    });
    const bookingB = await makeBooking({
      motherId: second.id,
      nannyProfileId: nanny.nannyProfileId,
      status: 'COMPLETED',
      date: dayAfter,
    });

    const fresh = await profileOf(nanny.nannyProfileId);
    expect(fresh.reviewCount).toBe(0);

    await submitReview(first.token, bookingA.id, 5, 'Wonderful.');
    let profile = await profileOf(nanny.nannyProfileId);
    expect(profile.reviewCount).toBe(1);
    expect(Number(profile.rating)).toBe(5);

    await submitReview(second.token, bookingB.id, 3);
    profile = await profileOf(nanny.nannyProfileId);
    expect(profile.reviewCount).toBe(2);
    expect(Number(profile.rating)).toBe(4);

    // What the next family sees.
    const shown = await publicProfile(first.token, nanny.nannyProfileId);
    expect(shown.reviewCount).toBe(2);
    expect(shown.rating).toBe(4);

    // The comment is kept against its booking.
    const stored = await prisma.review.findUniqueOrThrow({ where: { bookingId: bookingA.id } });
    expect(stored.comment).toBe('Wonderful.');
    expect(stored.nannyProfileId).toBe(nanny.nannyProfileId);
  });

  it('takes one review per booking', async () => {
    const nanny = await makeNanny();
    const mother = await makeMother();
    const booking = await makeBooking({
      motherId: mother.id,
      nannyProfileId: nanny.nannyProfileId,
      status: 'COMPLETED',
    });

    await submitReview(mother.token, booking.id, 2);
    const again = await review(mother.token, booking.id, 5);
    expect(again.status).toBe(409);

    const profile = await profileOf(nanny.nannyProfileId);
    expect(profile.reviewCount).toBe(1);
    expect(Number(profile.rating)).toBe(2);
  });

  it('refuses a review before the booking has completed, and from anyone but its mother', async () => {
    const nanny = await makeNanny();
    const mother = await makeMother();
    const bystander = await makeMother();
    const booking = await makeBooking({
      motherId: mother.id,
      nannyProfileId: nanny.nannyProfileId,
      status: 'CONFIRMED',
    });

    expect((await review(mother.token, booking.id, 5)).status).toBe(400);
    expect((await review(bystander.token, booking.id, 5)).status).toBe(403);

    const profile = await profileOf(nanny.nannyProfileId);
    expect(profile.reviewCount).toBe(0);
  });
});
