/**
 * A15 — who a broadcast request reaches: radius and skills.
 *
 * Care is broadcast, not assigned. Two rules decide which nannies a request is
 * offered to, and both are applied in two places that must agree: the
 * notification fan-out when the mother books (`notifyBookingBroadcast`) and the
 * open pool a nanny reads back (`GET /bookings/available`). A nanny outside the
 * configured radius, or missing a skill add-on the request was priced for, must
 * get neither the push nor the row — and must not be able to claim it by
 * calling the accept route directly, since the mother paid for that skill.
 *
 * The unit tests cover the geometry with a mocked client. This runs the real
 * settings rows, the real candidate query and the real fan-out end to end.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny, makeSkill } from '../../../test/factories';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';

/**
 * Nannies are placed relative to the mother's default position (Cairo,
 * 30.0444 N). One degree of latitude is ~111 km, so these offsets sit at
 * roughly 5.6 km and 16.7 km — one inside the default 10 km broadcast radius,
 * one outside it, both close enough that "far" is a fact about the setting
 * rather than about geography.
 */
const MOTHER_LAT = 30.0444;
const INSIDE_RADIUS_LAT = MOTHER_LAT + 0.05;
const OUTSIDE_RADIUS_LAT = MOTHER_LAT + 0.15;

/**
 * Neither key is in the baseline snapshot the DB reset restores — the readers
 * fall back to their defaults (10 km, matching on) when the row is absent — so
 * setting one means creating it, and the reset's truncate removes it again.
 */
async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSettings.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

const setBroadcastRadiusKm = (km: number) => setSetting('broadcast_radius_km', String(km));
const setSkillMatching = (enabled: boolean) =>
  setSetting('skill_matching_enabled', String(enabled));

/** The ids in the nanny's open pool, as her Requests tab reads them. */
async function poolFor(nannyToken: string): Promise<number[]> {
  const response = await request(app).get('/bookings/available').set(...authHeader(nannyToken));
  expect(response.status).toBe(200);
  return (response.body.data as Array<{ id: number }>).map((b) => b.id);
}

/** Whether a nanny was pushed about the request when it was created. */
async function wasNotified(userId: number, bookingId: number): Promise<boolean> {
  const count = await prisma.notification.count({
    where: { userId, type: 'BOOKING_REQUESTED', referenceId: bookingId },
  });
  return count > 0;
}

describe('A15 — broadcast radius', () => {
  it('reaches a nanny inside the radius and skips one outside it', async () => {
    const mother = await makeMother();
    const near = await makeNanny({ user: { latitude: INSIDE_RADIUS_LAT } });
    const far = await makeNanny({ user: { latitude: OUTSIDE_RADIUS_LAT } });

    const booking = await createBookingViaApi(mother.token);

    expect(await poolFor(near.token)).toContain(booking.id);
    expect(await poolFor(far.token)).not.toContain(booking.id);

    expect(await wasNotified(near.id, booking.id)).toBe(true);
    expect(await wasNotified(far.id, booking.id)).toBe(false);
  });

  it('reads the radius from the platform settings, not a constant', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny({ user: { latitude: INSIDE_RADIUS_LAT } });

    // Shrink the radius below the nanny's ~5.6 km and she drops out of the pool
    // for a request created afterwards; widen it and she is back.
    await setBroadcastRadiusKm(3);
    const tooFarNow = await createBookingViaApi(mother.token, { startHour: 10 });
    expect(await poolFor(nanny.token)).not.toContain(tooFarNow.id);
    expect(await wasNotified(nanny.id, tooFarNow.id)).toBe(false);

    await setBroadcastRadiusKm(10);
    const inRange = await createBookingViaApi(mother.token, { startHour: 15 });
    expect(await poolFor(nanny.token)).toContain(inRange.id);
    expect(await wasNotified(nanny.id, inRange.id)).toBe(true);
  });

  it('never hides work from a nanny whose profile has no coordinates', async () => {
    const mother = await makeMother();
    const unplaced = await makeNanny({ user: { latitude: null, longitude: null } });

    const booking = await createBookingViaApi(mother.token);

    expect(await poolFor(unplaced.token)).toContain(booking.id);
    expect(await wasNotified(unplaced.id, booking.id)).toBe(true);
  });
});

describe('A15 — skill matching', () => {
  it('offers a request priced with a skill add-on only to nannies who hold it', async () => {
    const skill = await makeSkill();
    const mother = await makeMother();
    const qualified = await makeNanny({ skillIds: [skill.id] });
    const unqualified = await makeNanny();

    const booking = await createBookingViaApi(mother.token, { skillIds: [skill.id] });

    expect(await poolFor(qualified.token)).toContain(booking.id);
    expect(await poolFor(unqualified.token)).not.toContain(booking.id);

    expect(await wasNotified(qualified.id, booking.id)).toBe(true);
    expect(await wasNotified(unqualified.id, booking.id)).toBe(false);
  });

  it('refuses a direct claim from a nanny missing the skill, and leaves the request open', async () => {
    const skill = await makeSkill();
    const mother = await makeMother();
    const unqualified = await makeNanny();
    const qualified = await makeNanny({ skillIds: [skill.id] });

    const booking = await createBookingViaApi(mother.token, { skillIds: [skill.id] });

    // A stale list or a hand-made request must not let her take work the
    // mother was priced for.
    const refused = await request(app)
      .post(`/bookings/${booking.id}/accept`)
      .set(...authHeader(unqualified.token));
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/skills that are not on your profile/i);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe('PENDING');
    expect(row.nannyProfileId).toBeNull();

    // The right nanny still can.
    await claimBooking(qualified.token, booking.id);
    const claimed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(claimed.nannyProfileId).toBe(qualified.nannyProfileId);
  });

  it('stops filtering on skills when the admin switches matching off', async () => {
    const skill = await makeSkill();
    const mother = await makeMother();
    const unqualified = await makeNanny();

    await setSkillMatching(false);
    const booking = await createBookingViaApi(mother.token, { skillIds: [skill.id] });

    expect(await poolFor(unqualified.token)).toContain(booking.id);
    expect(await wasNotified(unqualified.id, booking.id)).toBe(true);

    await claimBooking(unqualified.token, booking.id);
  });
});
