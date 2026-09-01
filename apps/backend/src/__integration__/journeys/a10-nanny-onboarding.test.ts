/**
 * A10 — a nanny signs up and an admin decides whether she reaches families.
 *
 * The assertion that matters is not the status column but its consequence:
 * an unapproved nanny is invisible to parent search and is not broadcast a
 * booking request. Approval is what makes her discoverable; rejection takes
 * that away again.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader, createEmulatorUser, signInAs } from '../../../test/auth';
import { makeMother, makeSuperuser } from '../../../test/factories';
import { approveNannyProfile } from '../../../test/journeys/admin';
import { createBookingViaApi } from '../../../test/journeys/booking';
import { proveEmail } from '../../../test/journeys/email-verification';

const ID_FRONT = 'https://storage.example.test/nanny-id-front.jpg';
const AVATAR = 'https://storage.example.test/nanny-avatar.jpg';

/**
 * Registers a nanny through the real route, ID and profile included. A nanny
 * proves her address mid-wizard, before her Firebase account exists, and
 * arrives at /auth/register holding the token for it — so the code really is
 * mailed and read back here too.
 */
async function registerNanny(lastName = 'Candidate') {
  const email = `nanny-reg-${process.pid}-${Date.now()}@test.local`;
  const emailVerificationToken = await proveEmail(email);
  await createEmulatorUser(email);
  const token = await signInAs(email);

  const response = await request(app)
    .post('/auth/register')
    .set(...authHeader(token))
    .send({
      emailVerificationToken,
      firstName: 'Newly',
      lastName,
      email,
      phone: `+2012${String(Date.now()).slice(-8)}`,
      dateOfBirth: '1995-06-15',
      role: 'NANNY',
      termsAcceptedVersion: '1.0',
      latitude: 30.0444,
      longitude: 31.2357,
      address: '3 Test Street, Cairo',
      // A passport needs only the front image.
      idDocumentType: 'PASSPORT',
      idDocumentFrontUrl: ID_FRONT,
      avatarUrl: AVATAR,
      bio: 'Five years with toddlers, first-aid trained.',
      yearsOfExperience: 5,
      availabilityType: 'FULL_TIME',
      ageRanges: ['0-1', '2-5'],
    });

  expect(response.status).toBe(201);
  // The token she carried in is what makes her account start out verified.
  expect(response.body.data.isEmailVerified).toBe(true);

  const userId = response.body.data.id as number;
  const profile = await prisma.nannyProfile.findFirstOrThrow({ where: { userId } });

  return { token, userId, nannyProfileId: profile.id, lastName };
}

/** Names visible to a parent browsing nannies. */
async function searchableLastNames(motherToken: string): Promise<string[]> {
  const response = await request(app)
    .get('/nanny/nannies')
    .set(...authHeader(motherToken));
  expect(response.status).toBe(200);
  return (response.body.data as Array<{ lastName?: string; name?: string }>).map(
    (row) => row.lastName ?? row.name ?? '',
  );
}

describe('A10 — nanny onboarding and approval', () => {
  it('registers a nanny awaiting review, invisible to parents', async () => {
    const nanny = await registerNanny();
    const mother = await makeMother();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: nanny.userId } });
    expect(user.role).toBe('NANNY');
    // Registering with an ID puts her straight into the review queue.
    expect(user.idVerificationStatus).toBe('PENDING_REVIEW');

    const names = await searchableLastNames(mother.token);
    expect(names.join(' ')).not.toContain(nanny.lastName);
  });

  it('is not broadcast a booking request while unapproved', async () => {
    const nanny = await registerNanny();
    const mother = await makeMother();

    const booking = await createBookingViaApi(mother.token);

    // The broadcast pool is filtered on an APPROVED user, so she is never told.
    const notified = await prisma.notification.count({
      where: { userId: nanny.userId, referenceId: booking.id },
    });
    expect(notified).toBe(0);
  });

  /**
   * KNOWN GAP — pinned, not endorsed.
   *
   * Being excluded from the broadcast is the *only* thing keeping an unvetted
   * nanny off a booking. `POST /bookings/:id/accept` carries `requireAuth`
   * alone: neither the route nor `applyNannyDecision` checks
   * `idVerificationStatus`, and `requireApprovedNanny` is mounted only on
   * `/nanny/dashboard`. Booking ids are sequential integers, so guessing one is
   * not a meaningful obstacle.
   *
   * These assertions record today's behaviour so the fix is visible as a
   * deliberate change here rather than as a mysterious red test. When the guard
   * lands, both expectations flip to 403 and the booking must stay unclaimed.
   */
  it('currently lets an unvetted nanny claim a booking she was never offered', async () => {
    const pending = await registerNanny();
    const mother = await makeMother();
    const booking = await createBookingViaApi(mother.token);

    const claim = await request(app)
      .post(`/bookings/${booking.id}/accept`)
      .set(...authHeader(pending.token));

    expect(claim.status).toBe(200);
    const claimed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(claimed.nannyProfileId).toBe(pending.nannyProfileId);
    // And it is now payable, with an unvetted carer attached.
    expect(claimed.status).toBe('APPROVED');
  });

  it('currently lets an explicitly rejected nanny claim one too', async () => {
    const nanny = await registerNanny();
    const admin = await makeSuperuser();
    const mother = await makeMother();

    await request(app)
      .post(`/admin/nannies/${nanny.nannyProfileId}/reject`)
      .set(...authHeader(admin.token))
      .send({ reason: 'The ID photo was unreadable.' })
      .expect(200);

    const booking = await createBookingViaApi(mother.token);
    const claim = await request(app)
      .post(`/bookings/${booking.id}/accept`)
      .set(...authHeader(nanny.token));

    // A rejection removes her from search but not from this path.
    expect(claim.status).toBe(200);
  });

  it('appears in the admin review queue and becomes discoverable on approval', async () => {
    const nanny = await registerNanny();
    const admin = await makeSuperuser();
    const mother = await makeMother();

    const queue = await request(app)
      .get('/admin/id-reviews')
      .set(...authHeader(admin.token));
    expect(queue.status).toBe(200);
    expect((queue.body.data as Array<{ id: number }>).some((r) => r.id === nanny.userId)).toBe(
      true,
    );

    await approveNannyProfile(admin.token, nanny.nannyProfileId);

    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: nanny.userId } }))
        .idVerificationStatus,
    ).toBe('APPROVED');

    // The consequence that matters: parents can now find her.
    const names = await searchableLastNames(mother.token);
    expect(names.join(' ')).toContain(nanny.lastName);

    // And she is told she is in.
    const note = await prisma.notification.findFirst({
      where: { userId: nanny.userId, type: 'NANNY_APPROVED' },
    });
    expect(note).not.toBeNull();
  });

  it('can claim and be paid for a booking once approved', async () => {
    const nanny = await registerNanny();
    const admin = await makeSuperuser();
    const mother = await makeMother();

    await approveNannyProfile(admin.token, nanny.nannyProfileId);

    const booking = await createBookingViaApi(mother.token);
    const claim = await request(app)
      .post(`/bookings/${booking.id}/accept`)
      .set(...authHeader(nanny.token));

    expect(claim.status).toBe(200);
    const claimed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(claimed.nannyProfileId).toBe(nanny.nannyProfileId);
    expect(claimed.status).toBe('APPROVED');
  });

  it('keeps a rejected nanny out of search and tells her why', async () => {
    const nanny = await registerNanny();
    const admin = await makeSuperuser();
    const mother = await makeMother();

    const rejected = await request(app)
      .post(`/admin/nannies/${nanny.nannyProfileId}/reject`)
      .set(...authHeader(admin.token))
      .send({ reason: 'The ID photo was unreadable.' });
    expect(rejected.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: nanny.userId } });
    expect(user.idVerificationStatus).toBe('REJECTED');
    expect(user.idRejectionReason).toBe('The ID photo was unreadable.');

    const names = await searchableLastNames(mother.token);
    expect(names.join(' ')).not.toContain(nanny.lastName);
  });

  it('refuses to approve the same nanny twice', async () => {
    const nanny = await registerNanny();
    const admin = await makeSuperuser();

    await approveNannyProfile(admin.token, nanny.nannyProfileId);

    await expect(
      approveNannyProfile(admin.token, nanny.nannyProfileId),
    ).rejects.toThrow(/400/);
  });
});
