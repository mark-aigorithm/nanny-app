/**
 * A14 — a mother's email address is proven during registration, and accounts
 * created before that rule are upgraded through `POST /auth/email`.
 *
 * Registration takes a one-time token for both roles now, so `users.email` is
 * never a placeholder on a new account: the payment receipt and the Paymob
 * billing record read it, and neither is worth anything if it was never proven.
 * The booking gate on `isEmailVerified` stays as the backstop for accounts that
 * predate the rule — the app blocks those on a verify screen at launch, and
 * this is the endpoint that screen calls.
 *
 * Nothing here is stubbed. The code really is mailed over SMTP to Mailpit and
 * really is read back out of the inbox — there is no bypass value.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader, createEmulatorUser, signInAs } from '../../../test/auth';
import { makeMother } from '../../../test/factories';
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

function uniqueEmail(): string {
  return `mum-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

/**
 * Registers a mother exactly as the app does: she signs in on the Firebase
 * account keyed to her phone placeholder, but proves a real address mid-wizard
 * and hands `/auth/register` the token for it. Sign-in stays phone-based;
 * `users.email` is the proven address from the first moment the row exists.
 */
async function registerMother(overrides: { email?: string; token?: string | null } = {}) {
  const phone = uniquePhone();
  const placeholder = placeholderEmail(phone);
  await createEmulatorUser(placeholder);
  const idToken = await signInAs(placeholder);

  const email = overrides.email ?? uniqueEmail();
  const emailVerificationToken =
    overrides.token === undefined ? await proveEmail(email) : overrides.token;

  const response = await request(app)
    .post('/auth/register')
    .set(...authHeader(idToken))
    .send({
      firstName: 'Gate',
      lastName: 'Tester',
      email,
      phone,
      dateOfBirth: '1992-04-01',
      role: 'MOTHER',
      termsAcceptedVersion: '1.0',
      latitude: 30.0444,
      longitude: 31.2357,
      address: '1 Test Street, Cairo',
      ...(emailVerificationToken ? { emailVerificationToken } : {}),
    });

  return { response, token: idToken, email, placeholder, phone };
}

/** A mother as she exists on an account created before registration proved the address. */
async function makeLegacyMother() {
  const mother = await makeMother({ isEmailVerified: false, emailVerifiedAt: null });
  const row = await prisma.user.update({
    where: { id: mother.id },
    data: { email: placeholderEmail(uniquePhone()) },
  });
  return { ...mother, placeholder: row.email, realEmail: uniqueEmail() };
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

describe('A14 — the address is proven at registration', () => {
  it('creates the account with the proven address, not the phone placeholder', async () => {
    const { response, email, placeholder } = await registerMother();
    expect(response.status).toBe(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: response.body.data.id } });
    expect(row.email).toBe(email);
    expect(row.email).not.toBe(placeholder);
    expect(row.isEmailVerified).toBe(true);
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it('refuses to register a mother who brings no token', async () => {
    const { response, phone } = await registerMother({ token: null });

    expect(response.status).toBe(400);
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('refuses a token that was issued for a different address', async () => {
    const stolen = await proveEmail(uniqueEmail());
    const { response, phone } = await registerMother({ token: stolen });

    expect(response.status).toBe(400);
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('lets her book straight away — nothing gates on email any more', async () => {
    const { response, token } = await registerMother();
    // A11 covers the ID gate; take it out of the picture here.
    await prisma.user.update({
      where: { id: response.body.data.id },
      data: { idVerificationStatus: 'APPROVED' },
    });

    expect((await attemptBooking(token)).status).toBe(201);
  });
});

describe('A14 — accounts created before the rule', () => {
  it('refuses a booking from an account that never proved an address', async () => {
    const mother = await makeLegacyMother();

    const response = await attemptBooking(mother.token);
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/verify your email/i);

    expect(await prisma.booking.count({ where: { motherId: mother.id } })).toBe(0);
  });

  it('mails a code, swaps it for a token, and opens booking once the address is attached', async () => {
    const mother = await makeLegacyMother();

    await verifyMyEmail(mother.token, mother.realEmail);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.email).toBe(mother.realEmail);
    expect(row.isEmailVerified).toBe(true);
    expect(row.emailVerifiedAt).not.toBeNull();

    expect((await attemptBooking(mother.token)).status).toBe(201);
  });

  it('records the send in the email log', async () => {
    const mother = await makeLegacyMother();
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
    const mother = await makeLegacyMother();

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
    const mother = await makeLegacyMother();
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
      .send({ email: uniqueEmail(), verificationToken });
    expect(second.status).toBe(400);
  });

  it('refuses a token that was issued for a different address', async () => {
    const mother = await makeLegacyMother();
    const verificationToken = await proveEmail(uniqueEmail());

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
    const first = await makeLegacyMother();
    await verifyMyEmail(first.token, first.realEmail);

    const second = await makeLegacyMother();
    const response = await request(app)
      .post('/auth/email/otp')
      .set(...authHeader(second.token))
      .send({ email: first.realEmail });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already exists/i);
  });

  it('enforces a resend cooldown on the same address', async () => {
    const mother = await makeLegacyMother();

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
});
