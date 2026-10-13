/**
 * A32 — a care log entry names which of the booking's children it is about.
 *
 * The booking's children are an id-less snapshot, so an entry carries their
 * labels on the booking (the name, or "Child 2 (3 yrs)" for an unnamed one).
 * The server only accepts labels that are on the booking, stores them in
 * booking order, and still takes an entry with none from older builds.
 */
import { BookingChildSchema } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeBooking, makeMother, makeNanny } from '../../../test/factories';

const CHILDREN = [
  BookingChildSchema.parse({ name: 'Lina', ageYears: 3 }),
  BookingChildSchema.parse({ name: 'Omar', ageYears: 5 }),
  BookingChildSchema.parse({ name: null, ageYears: 1 }),
];

async function setUp() {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const booking = await makeBooking({
    motherId: mother.id,
    nannyProfileId: nanny.nannyProfileId,
    status: 'IN_PROGRESS',
    data: {
      childrenCount: CHILDREN.length,
      bookedChildren: CHILDREN as unknown as Prisma.InputJsonValue,
    },
  });
  return { mother, nanny, booking };
}

describe('A32 — care log children', () => {
  it('stores the children an entry is about, in booking order, and tells the mother', async () => {
    const { mother, nanny, booking } = await setUp();

    const res = await request(app)
      .post(`/bookings/${booking.id}/care-logs`)
      .set(...authHeader(nanny.token))
      .send({ type: 'MEAL', childNames: ['Omar', 'Lina'] });
    expect(res.status).toBe(201);
    expect(res.body.data.childNames).toEqual(['Lina', 'Omar']);

    const feed = await request(app)
      .get(`/bookings/${booking.id}/care-logs`)
      .set(...authHeader(mother.token));
    expect(feed.body.data[0].childNames).toEqual(['Lina', 'Omar']);

    // The push is fire-and-forget; give the in-app row a moment to land.
    let note = null;
    for (let i = 0; i < 20 && !note; i++) {
      note = await prisma.notification.findFirst({
        where: { userId: mother.id, type: 'CARE_LOG_ENTRY' },
      });
      if (!note) await new Promise((r) => setTimeout(r, 50));
    }
    expect(note?.body).toMatch(/logged a meal for Lina & Omar$/);
  });

  it('accepts the label of an unnamed child', async () => {
    const { nanny, booking } = await setUp();
    const res = await request(app)
      .post(`/bookings/${booking.id}/care-logs`)
      .set(...authHeader(nanny.token))
      .send({ type: 'NAP', childNames: ['Child 3 (1 yr)'] });
    expect(res.status).toBe(201);
    expect(res.body.data.childNames).toEqual(['Child 3 (1 yr)']);
  });

  it('refuses a child who is not on the booking', async () => {
    const { nanny, booking } = await setUp();
    const res = await request(app)
      .post(`/bookings/${booking.id}/care-logs`)
      .set(...authHeader(nanny.token))
      .send({ type: 'MEAL', childNames: ['Lina', 'Sami'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Sami/);
    expect(await prisma.careLog.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it('still takes an entry with no children from an older build', async () => {
    const { nanny, booking } = await setUp();
    const res = await request(app)
      .post(`/bookings/${booking.id}/care-logs`)
      .set(...authHeader(nanny.token))
      .send({ type: 'DIAPER' });
    expect(res.status).toBe(201);
    expect(res.body.data.childNames).toEqual([]);
  });
});
