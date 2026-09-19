/**
 * A21 — cameras: the console catalogue and the mother's live monitor.
 *
 * A camera belongs to a nanny, not a booking: an operator creates one with a
 * stream URL and assigns it, and a booking resolves to a feed through its
 * assigned nanny. The mother may open that feed only while her booking is in
 * progress, and only she may — it is a window into somebody else's home. She
 * can also ask the nanny to switch the camera on, which is rate-limited so a
 * worried parent tapping repeatedly sends one nudge, not ten.
 *
 * The stream URL points at a closed local port, so the reachability probe
 * fails fast and deterministically — "online: false" is the expected answer,
 * and the journey is about who may ask, not whether a real camera answers.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeNanny } from '../../../test/factories';
import {
  checkIn,
  claimBooking,
  createBookingViaApi,
  shiftWindowToNow,
} from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

/** Nothing listens on port 1; the probe's TCP connect is refused at once. */
const UNREACHABLE_STREAM = 'rtsp://127.0.0.1:1/nursery';

async function createCamera(adminToken: string, nannyUserId: number | null, name = 'Nursery') {
  const response = await request(app)
    .post('/admin/cameras')
    .set(...authHeader(adminToken))
    .send({ name, streamUrl: UNREACHABLE_STREAM, nannyUserId });
  expect(response.status).toBe(201);
  return response.body.data as { id: number; nannyUserId: number | null; nannyName: string | null };
}

function getFeed(token: string, bookingId: number) {
  return request(app).get(`/bookings/${bookingId}/camera`).set(...authHeader(token));
}

function nudge(token: string, bookingId: number) {
  return request(app).post(`/bookings/${bookingId}/camera/notify`).set(...authHeader(token));
}

/** A paid booking the nanny has checked in to. */
async function shiftInProgress(nannyToken: string, motherToken: string) {
  const booking = await createBookingViaApi(motherToken);
  await claimBooking(nannyToken, booking.id);
  await payViaPaymob(motherToken, 'booking', booking.id);
  await shiftWindowToNow(booking.id);
  await checkIn(motherToken, nannyToken, booking.id);
  return booking;
}

describe('A21 — the camera catalogue', () => {
  it('lists a camera against the nanny it is assigned to, and only ID-verified nannies are offered', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny({ user: { firstName: 'Mona', lastName: 'Saleh' } });
    const unverified = await makeNanny({ user: { approvalStatus: 'PENDING_REVIEW' } });

    const options = await request(app)
      .get('/admin/cameras/nanny-options')
      .set(...authHeader(admin.token));
    const offered = (options.body.data as Array<{ userId: number }>).map((n) => n.userId);
    expect(offered).toContain(nanny.id);
    expect(offered).not.toContain(unverified.id);

    // The picker and the write agree: what isn't offered can't be assigned by hand either.
    const refused = await request(app)
      .post('/admin/cameras')
      .set(...authHeader(admin.token))
      .send({ name: 'Nursery', streamUrl: UNREACHABLE_STREAM, nannyUserId: unverified.id });
    expect(refused.status).toBe(400);

    const camera = await createCamera(admin.token, nanny.id);
    expect(camera).toMatchObject({ nannyUserId: nanny.id, nannyName: 'Mona Saleh' });

    const list = await request(app).get('/admin/cameras').set(...authHeader(admin.token));
    expect(list.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: camera.id, nannyUserId: nanny.id })]),
    );
  });

  it('is behind the Cameras section', async () => {
    const nanny = await makeNanny();
    const mother = await makeMother();
    for (const token of [nanny.token, mother.token]) {
      expect((await request(app).get('/admin/cameras').set(...authHeader(token))).status).toBe(403);
    }
  });
});

describe('A21 — the live monitor', () => {
  it('opens for the mother during the shift, and the booking says a camera exists', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const mother = await makeMother();
    await createCamera(admin.token, nanny.id);

    const booking = await shiftInProgress(nanny.token, mother.token);

    const detail = await request(app).get(`/bookings/${booking.id}`).set(...authHeader(mother.token));
    expect(detail.body.data.hasCamera).toBe(true);

    const feed = await getFeed(mother.token, booking.id);
    expect(feed.status).toBe(200);
    expect(feed.body.data).toMatchObject({ name: 'Nursery', streamUrl: UNREACHABLE_STREAM, online: false });
  });

  it('is not offered before the shift starts, nor to the nanny', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const mother = await makeMother();
    await createCamera(admin.token, nanny.id);

    const booking = await createBookingViaApi(mother.token);
    await claimBooking(nanny.token, booking.id);
    await payViaPaymob(mother.token, 'booking', booking.id);

    const early = await getFeed(mother.token, booking.id);
    expect(early.status).toBe(403);
    expect(early.body.error).toMatch(/in progress/i);

    await shiftWindowToNow(booking.id);
    await checkIn(mother.token, nanny.token, booking.id);
    expect((await getFeed(nanny.token, booking.id)).status).toBe(403);
  });

  it('reports "no camera" for a nanny without one, and follows a reassignment', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const other = await makeNanny();
    const mother = await makeMother();

    const booking = await shiftInProgress(nanny.token, mother.token);

    const detail = await request(app).get(`/bookings/${booking.id}`).set(...authHeader(mother.token));
    expect(detail.body.data.hasCamera).toBe(false);
    const none = await getFeed(mother.token, booking.id);
    expect(none.status).toBe(404);
    expect(none.body.error).toMatch(/no camera/i);

    const camera = await createCamera(admin.token, nanny.id);
    expect((await getFeed(mother.token, booking.id)).status).toBe(200);

    // Moved to another nanny, the feed leaves this booking with it.
    await request(app)
      .patch(`/admin/cameras/${camera.id}`)
      .set(...authHeader(admin.token))
      .send({ nannyUserId: other.id })
      .expect(200);
    expect((await getFeed(mother.token, booking.id)).status).toBe(404);

    // And deleting it leaves the "no camera" state, not an error.
    await request(app)
      .patch(`/admin/cameras/${camera.id}`)
      .set(...authHeader(admin.token))
      .send({ nannyUserId: nanny.id })
      .expect(200);
    await request(app).delete(`/admin/cameras/${camera.id}`).set(...authHeader(admin.token)).expect(200);
    expect((await getFeed(mother.token, booking.id)).status).toBe(404);
  });
});

describe('A21 — asking the nanny to switch the camera on', () => {
  it('notifies the nanny once, then holds the parent to the cooldown', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const mother = await makeMother();
    await createCamera(admin.token, nanny.id);
    const booking = await shiftInProgress(nanny.token, mother.token);

    const sent = await nudge(mother.token, booking.id);
    expect(sent.status).toBe(200);
    expect(typeof sent.body.data.notifiedAt).toBe('string');

    const told = await prisma.notification.findFirst({
      where: { userId: nanny.id, type: 'CAMERA_REQUESTED', referenceId: booking.id },
    });
    expect(told).not.toBeNull();

    const again = await nudge(mother.token, booking.id);
    expect(again.status).toBe(429);
    expect(again.body.error).toMatch(/already asked/i);
    expect(
      await prisma.notification.count({
        where: { userId: nanny.id, type: 'CAMERA_REQUESTED', referenceId: booking.id },
      }),
    ).toBe(1);
  });

  it('cannot be sent by the nanny, or for a booking that is not running', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const mother = await makeMother();
    await createCamera(admin.token, nanny.id);

    const booking = await createBookingViaApi(mother.token);
    await claimBooking(nanny.token, booking.id);
    expect((await nudge(mother.token, booking.id)).status).toBe(403);

    await payViaPaymob(mother.token, 'booking', booking.id);
    await shiftWindowToNow(booking.id);
    await checkIn(mother.token, nanny.token, booking.id);
    expect((await nudge(nanny.token, booking.id)).status).toBe(403);
  });
});
