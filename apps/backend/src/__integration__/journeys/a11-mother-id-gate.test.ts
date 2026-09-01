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
import { wallClockTomorrow } from '../../../test/journeys/booking';
import { verifyMyEmail } from '../../../test/journeys/email-verification';

const ID_FRONT = 'https://storage.example.test/id-front.jpg';
const ID_BACK = 'https://storage.example.test/id-back.jpg';

/**
 * Registers a brand-new mother through the real route, as the app does, and
 * gets her past the email gate — which `createBooking` checks before the ID
 * gate this suite is about.
 */
async function registerMother() {
  const email = `gate-${process.pid}-${Date.now()}@test.local`;
  await createEmulatorUser(email);
  const token = await signInAs(email);

  const response = await request(app)
    .post('/auth/register')
    .set(...authHeader(token))
    .send({
      firstName: 'Gate',
      lastName: 'Tester',
      email,
      phone: `+2011${String(Date.now()).slice(-8)}`,
      dateOfBirth: '1992-04-01',
      role: 'MOTHER',
      termsAcceptedVersion: '1.0',
      latitude: 30.0444,
      longitude: 31.2357,
      address: '1 Test Street, Cairo',
    });

  expect(response.status).toBe(201);

  // Past the email gate, which createBooking checks first. A14 covers that
  // gate on its own terms; here it just has to be out of the way.
  await verifyMyEmail(token, email);

  return { token, id: response.body.data.id as number, email };
}

function attemptBooking(token: string) {
  return request(app)
    .post('/bookings')
    .set(...authHeader(token))
    .send({
      startTime: wallClockTomorrow(10),
      endTime: wallClockTomorrow(14),
      children: [{ name: 'Test Child', ageYears: 3, allergies: null }],
    });
}

describe('A11 — mother ID verification gates booking', () => {
  it('registers a mother at PENDING_ID', async () => {
    const mother = await registerMother();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.role).toBe('MOTHER');
    expect(row.idVerificationStatus).toBe('PENDING_ID');
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
        idDocumentFrontUrl: ID_FRONT,
        idDocumentBackUrl: ID_BACK,
      });
    expect(submitted.status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.idVerificationStatus).toBe('PENDING_REVIEW');

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
        idDocumentFrontUrl: ID_FRONT,
        idDocumentBackUrl: ID_BACK,
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
      (await prisma.user.findUniqueOrThrow({ where: { id: mother.id } })).idVerificationStatus,
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
      .send({ idDocumentType: 'PASSPORT', idDocumentFrontUrl: ID_FRONT })
      .expect(200);

    const rejected = await request(app)
      .post(`/admin/mothers/${mother.id}/reject`)
      .set(...authHeader(admin.token))
      .send({ reason: 'The document was unreadable.' });
    expect(rejected.status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.idVerificationStatus).toBe('REJECTED');
    expect(row.idRejectionReason).toBe('The document was unreadable.');

    // A rejection revokes the permission a submission had granted.
    expect((await attemptBooking(mother.token)).status).toBe(403);
  });

  it('lets a rejected mother resubmit and be approved', async () => {
    const mother = await registerMother();
    const admin = await makeSuperuser();

    await request(app)
      .post('/auth/id')
      .set(...authHeader(mother.token))
      .send({ idDocumentType: 'PASSPORT', idDocumentFrontUrl: ID_FRONT })
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
      .send({ idDocumentType: 'PASSPORT', idDocumentFrontUrl: ID_FRONT })
      .expect(200);

    await approveMotherId(admin.token, mother.id);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.idVerificationStatus).toBe('APPROVED');
    expect(row.idRejectionReason).toBeNull();

    expect((await attemptBooking(mother.token)).status).toBe(201);
  });
});
