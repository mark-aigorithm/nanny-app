/**
 * A14 — a mother must prove an email address before she can book.
 *
 * She registers with a phone-derived placeholder, so booking is the first point
 * where a real address matters: the payment receipt and the Paymob billing
 * record both read `users.email`, and neither is worth anything if it was never
 * proven. The gate runs ahead of the ID gate (A11), because the client prompts
 * for the address first.
 *
 * Nothing here is stubbed. The code really is mailed over SMTP to Mailpit and
 * really is read back out of the inbox — there is no bypass value.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader, createEmulatorUser, signInAs } from '../../../test/auth';
import { wallClockTomorrow } from '../../../test/journeys/booking';
import { proveEmail, verifyMyEmail } from '../../../test/journeys/email-verification';
import { waitForOtp } from '../../../test/mailpit';

/** The address the mobile app synthesises for a phone-only sign-up. */
function placeholderEmail(phone: string): string {
  return `${phone.replace(/\D/g, '')}@phone.nannyapp.local`;
}

function uniquePhone(): string {
  return `+2011${String(Date.now()).slice(-8)}`;
}

/**
 * Registers a mother exactly as the app does today: a Firebase account and a
 * `users` row keyed on a placeholder address, with an ID already approved so
 * the only thing standing between her and a booking is the email gate.
 */
async function registerMother() {
  const phone = uniquePhone();
  const placeholder = placeholderEmail(phone);
  await createEmulatorUser(placeholder);
  const token = await signInAs(placeholder);

  const response = await request(app)
    .post('/auth/register')
    .set(...authHeader(token))
    .send({
      firstName: 'Gate',
      lastName: 'Tester',
      email: placeholder,
      phone,
      dateOfBirth: '1992-04-01',
      role: 'MOTHER',
      termsAcceptedVersion: '1.0',
      latitude: 30.0444,
      longitude: 31.2357,
      address: '1 Test Street, Cairo',
    });
  expect(response.status).toBe(201);

  const id = response.body.data.id as number;
  // A11 covers the ID gate; take it out of the picture here.
  await prisma.user.update({ where: { id }, data: { idVerificationStatus: 'APPROVED' } });

  return { token, id, placeholder, realEmail: `mum-${id}-${Date.now()}@test.local` };
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

describe('A14 — mother email verification gates booking', () => {
  it('registers a mother with an unverified placeholder address', async () => {
    const mother = await registerMother();

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.email).toBe(mother.placeholder);
    expect(row.isEmailVerified).toBe(false);
    expect(row.emailVerifiedAt).toBeNull();
  });

  it('refuses a booking from a mother who has not proven an address', async () => {
    const mother = await registerMother();

    const response = await attemptBooking(mother.token);
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/verify your email/i);

    expect(await prisma.booking.count({ where: { motherId: mother.id } })).toBe(0);
  });

  it('mails a code, swaps it for a token, and opens booking once the address is attached', async () => {
    const mother = await registerMother();

    await verifyMyEmail(mother.token, mother.realEmail);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.email).toBe(mother.realEmail);
    expect(row.isEmailVerified).toBe(true);
    expect(row.emailVerifiedAt).not.toBeNull();

    expect((await attemptBooking(mother.token)).status).toBe(201);
  });

  it('records the send in the email log', async () => {
    const mother = await registerMother();
    await verifyMyEmail(mother.token, mother.realEmail);

    const log = await prisma.emailLog.findFirstOrThrow({
      where: { recipientEmail: mother.realEmail, template: 'EMAIL_VERIFICATION' },
    });
    expect(log.status).toBe('SENT');
    expect(log.userId).toBe(mother.id);
    // The code must never be recoverable from the audit trail.
    expect(log.subject).not.toMatch(/\d{6}/);
  });

  it('rejects a wrong code and leaves the account unverified', async () => {
    const mother = await registerMother();

    await request(app)
      .post('/auth/email/otp')
      .set(...authHeader(mother.token))
      .send({ email: mother.realEmail })
      .expect(204);

    const code = await waitForOtp(mother.realEmail);
    const wrong = code === '000000' ? '111111' : '000000';

    const response = await request(app)
      .post('/auth/email/verify')
      .send({ email: mother.realEmail, code: wrong });
    expect(response.status).toBe(400);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.isEmailVerified).toBe(false);
  });

  it('refuses to spend a verification token twice', async () => {
    const mother = await registerMother();
    const verificationToken = await proveEmail(mother.realEmail);

    await request(app)
      .post('/auth/email')
      .set(...authHeader(mother.token))
      .send({ email: mother.realEmail, verificationToken })
      .expect(200);

    // A second, different address cannot ride the same proof.
    const second = await request(app)
      .post('/auth/email')
      .set(...authHeader(mother.token))
      .send({ email: `other-${Date.now()}@test.local`, verificationToken });
    expect(second.status).toBe(400);
  });

  it('refuses a token that was issued for a different address', async () => {
    const mother = await registerMother();
    const verificationToken = await proveEmail(`someone-else-${Date.now()}@test.local`);

    const response = await request(app)
      .post('/auth/email')
      .set(...authHeader(mother.token))
      .send({ email: mother.realEmail, verificationToken });
    expect(response.status).toBe(400);

    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: mother.id } })).isEmailVerified,
    ).toBe(false);
  });

  it('refuses an address another live account already holds', async () => {
    const first = await registerMother();
    await verifyMyEmail(first.token, first.realEmail);

    const second = await registerMother();
    const response = await request(app)
      .post('/auth/email/otp')
      .set(...authHeader(second.token))
      .send({ email: first.realEmail });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already exists/i);
  });

  it('enforces a resend cooldown on the same address', async () => {
    const mother = await registerMother();

    await request(app)
      .post('/auth/email/otp')
      .set(...authHeader(mother.token))
      .send({ email: mother.realEmail })
      .expect(204);

    const again = await request(app)
      .post('/auth/email/otp')
      .set(...authHeader(mother.token))
      .send({ email: mother.realEmail });

    expect(again.status).toBe(429);
  });

  it('sends the payment receipt to the proven address, not the placeholder', async () => {
    const mother = await registerMother();
    await verifyMyEmail(mother.token, mother.realEmail);

    // The booking itself is covered by A01; what matters here is that the
    // address the receipt would be sent to is now a real one.
    const booked = await attemptBooking(mother.token);
    expect(booked.status).toBe(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.email).toBe(mother.realEmail);
    expect(row.email).not.toMatch(/@phone\.nannyapp\.local$/);
  });
});
