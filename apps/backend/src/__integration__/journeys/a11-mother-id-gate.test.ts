/**
 * A11 — a mother must have an ID on file before she can book.
 *
 * The gate is narrower than "verified": it refuses PENDING_ID (never uploaded)
 * and REJECTED (must re-upload), but deliberately *allows* PENDING_REVIEW so a
 * mother can book while her document is in the queue — upload-then-book, not
 * upload-and-wait. That distinction is the whole rule, so it is asserted in
 * both directions here.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader, createEmulatorUser, signInAs } from '../../../test/auth';
import { makeSuperuser } from '../../../test/factories';
import { approveMotherId } from '../../../test/journeys/admin';
import { defaultAddressId, wallClockTomorrow } from '../../../test/journeys/booking';
import { proveEmail } from '../../../test/journeys/email-verification';
import { storageUrl } from '../../../test/storage-url';

/**
 * Registers a brand-new mother through the real route, as the app does —
 * proving her address mid-wizard and handing `/auth/register` the token for it,
 * so she arrives already past the email gate `createBooking` checks before the
 * ID gate this suite is about. A14 covers that gate on its own terms.
 */
async function registerMother() {
  const email = `gate-${process.pid}-${Date.now()}@test.local`;
  // The wizard links her verified phone before registering, so the token carries it.
  const phone = `+2011${String(Date.now()).slice(-8)}`;
  const uid = await createEmulatorUser(email, undefined, phone);
  const token = await signInAs(email);
  const emailVerificationToken = await proveEmail(email);

  const response = await request(app)
    .post('/auth/register')
    .set(...authHeader(token))
    .send({
      firstName: 'Gate',
      lastName: 'Tester',
      email,
      emailVerificationToken,
      phone,
      dateOfBirth: '1992-04-01',
      role: 'MOTHER',
      termsAcceptedVersion: 'v1.0',
      latitude: 30.0444,
      longitude: 31.2357,
      address: '1 Test Street, Cairo',
      avatarUrl: storageUrl('avatars', uid),
    });

  expect(response.status).toBe(201);

  return { token, id: response.body.data.id as number, email, uid };
}

async function attemptBooking(token: string) {
  return request(app)
    .post('/bookings')
    .set(...authHeader(token))
    .send({
      startTime: wallClockTomorrow(10),
      endTime: wallClockTomorrow(14),
      children: [{ name: 'Test Child', ageYears: 3, allergies: null }],
      // The address she registered with — what the picker preselects.
      addressId: await defaultAddressId(token),
    });
}

describe('A11 — mother ID verification gates booking', () => {
  it('registers a mother at PENDING_ID', async () => {
    const mother = await registerMother();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.role).toBe('MOTHER');
    expect(row.approvalStatus).toBe('PENDING_ID');
  });

  it('refuses a booking from a mother who has never uploaded an ID', async () => {
    const mother = await registerMother();

    const response = await attemptBooking(mother.token);
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/upload your ID/i);

    expect(await prisma.booking.count({ where: { motherId: mother.id } })).toBe(0);
  });

  it('lets her book as soon as the ID is submitted, before review', async () => {
    const mother = await registerMother();

    const submitted = await request(app)
      .post('/auth/id')
      .set(...authHeader(mother.token))
      .send({
        idDocumentType: 'NATIONAL_ID',
        idDocumentFrontUrl: storageUrl('nanny-ids', mother.uid, 'front.jpg'),
        idDocumentBackUrl: storageUrl('nanny-ids', mother.uid, 'back.jpg'),
      });
    expect(submitted.status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.approvalStatus).toBe('PENDING_REVIEW');

    // Upload-then-book: having a document in the queue is enough.
    expect((await attemptBooking(mother.token)).status).toBe(201);
  });

  it('opens booking the moment an admin approves', async () => {
    const mother = await registerMother();
    const admin = await makeSuperuser();

    await request(app)
      .post('/auth/id')
      .set(...authHeader(mother.token))
      .send({
        idDocumentType: 'NATIONAL_ID',
        idDocumentFrontUrl: storageUrl('nanny-ids', mother.uid, 'front.jpg'),
        idDocumentBackUrl: storageUrl('nanny-ids', mother.uid, 'back.jpg'),
      })
      .expect(200);

    // The pending account is visible in the review queue the admin works from.
    const queue = await request(app)
      .get('/admin/id-reviews')
      .set(...authHeader(admin.token));
    expect(queue.status).toBe(200);
    expect((queue.body.data as Array<{ id: number }>).some((row) => row.id === mother.id)).toBe(
      true,
    );

    await approveMotherId(admin.token, mother.id);

    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: mother.id } })).approvalStatus,
    ).toBe('APPROVED');

    const booked = await attemptBooking(mother.token);
    expect(booked.status).toBe(201);
  });

  it('closes booking again if the ID is rejected', async () => {
    const mother = await registerMother();
    const admin = await makeSuperuser();

    await request(app)
      .post('/auth/id')
      .set(...authHeader(mother.token))
      .send({ idDocumentType: 'PASSPORT', idDocumentFrontUrl: storageUrl('nanny-ids', mother.uid, 'front.jpg') })
      .expect(200);

    const rejected = await request(app)
      .post(`/admin/mothers/${mother.id}/reject`)
      .set(...authHeader(admin.token))
      .send({ reason: 'The document was unreadable.' });
    expect(rejected.status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.approvalStatus).toBe('REJECTED');
    expect(row.rejectionReason).toBe('The document was unreadable.');

    // A rejection revokes the permission a submission had granted.
    expect((await attemptBooking(mother.token)).status).toBe(403);
  });

  it('lets a rejected mother resubmit and be approved', async () => {
    const mother = await registerMother();
    const admin = await makeSuperuser();

    await request(app)
      .post('/auth/id')
      .set(...authHeader(mother.token))
      .send({ idDocumentType: 'PASSPORT', idDocumentFrontUrl: storageUrl('nanny-ids', mother.uid, 'front.jpg') })
      .expect(200);

    await request(app)
      .post(`/admin/mothers/${mother.id}/reject`)
      .set(...authHeader(admin.token))
      .send({ reason: 'Blurry.' })
      .expect(200);

    // A second attempt puts her back in the queue, with the old reason cleared.
    await request(app)
      .post('/auth/id')
      .set(...authHeader(mother.token))
      .send({ idDocumentType: 'PASSPORT', idDocumentFrontUrl: storageUrl('nanny-ids', mother.uid, 'front.jpg') })
      .expect(200);

    await approveMotherId(admin.token, mother.id);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.approvalStatus).toBe('APPROVED');
    expect(row.rejectionReason).toBeNull();

    expect((await attemptBooking(mother.token)).status).toBe(201);
  });
});
