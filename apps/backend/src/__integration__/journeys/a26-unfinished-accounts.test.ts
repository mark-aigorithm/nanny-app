/**
 * A26 — discarding an unfinished account and reclaiming a proven email.
 *
 * Both routes exist for the same problem: a Firebase account created mid-wizard
 * that never got a `users` row, permanently squatting the email/phone it signed
 * up with. `DELETE /auth/me` lets its own owner start over; `POST
 * /auth/reclaim-email` lets a *different* unfinished sign-up take over an
 * address once she has proven she owns it, evicting the stale Firebase
 * identity still holding it. Neither route ever touches a real (row-backed)
 * account — that is exactly what each "kept"/409 case below proves.
 */
import request from 'supertest';

import { CURRENT_TERMS_VERSION } from '@nanny-app/shared';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import { assertVerificationTokenIsValid } from '@backend/services/email-verification.service';

import {
  authHeader,
  createEmulatorUser,
  signInAs,
  signInWithGoogleAs,
  uidOf,
} from '../../../test/auth';
import { makeMother } from '../../../test/factories';
import { proveEmail } from '../../../test/journeys/email-verification';
import { storageUrl } from '../../../test/storage-url';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

function uniquePhone(): string {
  return `+2017${String(Date.now()).slice(-8)}`;
}

const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists. Sign in instead.';

describe('A26 — DELETE /auth/me discards an unfinished account', () => {
  it('deletes the Firebase account of a caller with no users row', async () => {
    const email = uniqueEmail('a26-discard');
    const uid = await createEmulatorUser(email);
    const token = await signInAs(email);

    const response = await request(app).delete('/auth/me').set(...authHeader(token));

    expect(response.status).toBe(204);
    await expect(firebaseAuth.getUser(uid)).rejects.toMatchObject({ code: 'auth/user-not-found' });
  });

  it('refuses a registered mother calling with no body, leaving her Firebase account intact', async () => {
    const mother = await makeMother();

    const response = await request(app).delete('/auth/me').set(...authHeader(mother.token));

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("This account can't be removed here.");
    await expect(firebaseAuth.getUser(mother.firebaseUid)).resolves.toMatchObject({
      uid: mother.firebaseUid,
    });
  });
});

describe('A26 — POST /auth/reclaim-email hands over a proven address', () => {
  it('evicts a stale row-less holder once the caller proves the address, without burning the token', async () => {
    const email = uniqueEmail('a26-reclaim-happy');
    // A: a Firebase account holding `email`, but no users row — exactly the
    // "unfinished" state this route exists to clean up.
    const uidA = await createEmulatorUser(email);

    // B: the caller, also row-less, who now wants that same address.
    const emailB = uniqueEmail('a26-reclaim-happy-caller');
    await createEmulatorUser(emailB);
    const tokenB = await signInAs(emailB);

    const verificationToken = await proveEmail(email);

    const response = await request(app)
      .post('/auth/reclaim-email')
      .set(...authHeader(tokenB))
      .send({ email, emailVerificationToken: verificationToken });

    expect(response.status).toBe(204);
    await expect(firebaseAuth.getUser(uidA)).rejects.toMatchObject({ code: 'auth/user-not-found' });
    // The token was only read, not spent — /auth/register can still spend it.
    await expect(assertVerificationTokenIsValid(email, verificationToken)).resolves.toBeUndefined();
  });

  it('refuses when the holder has since become a real account, keeping her row and Firebase identity', async () => {
    const email = uniqueEmail('a26-reclaim-taken');

    // B proves the address first, while it is still unclaimed by anyone.
    const emailB = uniqueEmail('a26-reclaim-taken-caller');
    await createEmulatorUser(emailB);
    const tokenB = await signInAs(emailB);
    const staleToken = await proveEmail(email);

    // A now finishes registration for real, through the Firebase-verified
    // (Google) path — no OTP token of ours involved, so B's stale token is
    // never touched by this.
    const phoneA = uniquePhone();
    const idTokenA = await signInWithGoogleAs(email, { emailVerified: true, phoneNumber: phoneA });
    const uidA = uidOf(idTokenA);
    const registerResponse = await request(app)
      .post('/auth/register')
      .set(...authHeader(idTokenA))
      .send({
        firstName: 'Stale',
        lastName: 'Holder',
        email,
        phone: phoneA,
        dateOfBirth: '1990-01-01',
        role: 'MOTHER',
        termsAcceptedVersion: CURRENT_TERMS_VERSION,
        latitude: 30.0444,
        longitude: 31.2357,
        address: '1 Test Street, Cairo',
        avatarUrl: storageUrl('avatars', uidA),
      });
    expect(registerResponse.status).toBe(201);

    const response = await request(app)
      .post('/auth/reclaim-email')
      .set(...authHeader(tokenB))
      .send({ email, emailVerificationToken: staleToken });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(EMAIL_TAKEN_MESSAGE);
    await expect(firebaseAuth.getUser(uidA)).resolves.toMatchObject({ uid: uidA });
    expect(await prisma.user.count({ where: { firebaseUid: uidA, email, deletedAt: null } })).toBe(1);
  });

  it('refuses a bad token before looking up anyone', async () => {
    const emailB = uniqueEmail('a26-reclaim-badtoken');
    await createEmulatorUser(emailB);
    const tokenB = await signInAs(emailB);

    const response = await request(app)
      .post('/auth/reclaim-email')
      .set(...authHeader(tokenB))
      .send({ email: uniqueEmail('a26-reclaim-badtoken-target'), emailVerificationToken: 'not-a-real-token' });

    expect(response.status).toBe(400);
  });
});

describe('A26 — POST /auth/phone-account answers before an SMS is sent', () => {
  async function ask(phone: string): Promise<boolean> {
    const response = await request(app).post('/auth/phone-account').send({ phone });
    expect(response.status).toBe(200);
    return response.body.data.hasAccount as boolean;
  }

  it('is true for a registered mother', async () => {
    const mother = await makeMother();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id }, select: { phone: true } });

    expect(row.phone).not.toBeNull();
    expect(await ask(row.phone ?? '')).toBe(true);
  });

  it('is true for an unfinished sign-up with a password and the number — it is resumed', async () => {
    const phone = uniquePhone();
    await createEmulatorUser(uniqueEmail('a26-phone-leftover'), undefined, phone);

    expect(await ask(phone)).toBe(true);
  });

  it('is false for a phone-only Firebase user with no row, and for a number nobody holds', async () => {
    const strayPhone = uniquePhone();
    await firebaseAuth.createUser({ phoneNumber: strayPhone });

    expect(await ask(strayPhone)).toBe(false);
    expect(await ask('+201799999999')).toBe(false);
  });
});
