/**
 * A24 — a Google or Apple sign-up registers without our email OTP.
 *
 * Firebase has already verified the provider's address, so `/auth/register`
 * takes the ID token's own `email_verified` claim in place of a token — but
 * only for that exact address, and only when it really is verified. The
 * Google account here is a real emulator account created by a real IdP
 * sign-in; nothing about the token path is stubbed.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader, signInWithGoogleAs, uidOf } from '../../../test/auth';
import { storageUrl } from '../../../test/storage-url';

function uniquePhone(): string {
  return `+2011${String(Date.now()).slice(-8)}`;
}

function uniqueEmail(): string {
  return `google-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

function registrationBody(email: string, phone: string, uid: string) {
  return {
    firstName: 'Salma',
    lastName: 'Google',
    email,
    phone,
    dateOfBirth: '1993-02-03',
    role: 'MOTHER',
    termsAcceptedVersion: 'v1.0',
    latitude: 30.0444,
    longitude: 31.2357,
    address: '1 Test Street, Cairo',
    avatarUrl: storageUrl('avatars', uid),
  };
}

describe('A24 — social registration', () => {
  it('registers a Google sign-up that brings no token, starting out verified', async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    const idToken = await signInWithGoogleAs(email, { phoneNumber: phone });

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send(registrationBody(email, phone, uidOf(idToken)));

    expect(response.status).toBe(201);
    expect(response.body.data.isEmailVerified).toBe(true);
    expect(response.body.data.isPhoneVerified).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { phone } });
    expect(row.email).toBe(email);
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it('refuses an address other than the one Google verified', async () => {
    const phone = uniquePhone();
    const idToken = await signInWithGoogleAs(uniqueEmail(), { phoneNumber: phone });

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send(registrationBody(uniqueEmail(), phone, uidOf(idToken)));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/verify your email address/);
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('refuses when the provider did not verify the address', async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    const idToken = await signInWithGoogleAs(email, { emailVerified: false, phoneNumber: phone });

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send(registrationBody(email, phone, uidOf(idToken)));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/verify your email address/);
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });
  it('refuses a Google-only account whose phone was never verified', async () => {
    // The squatting case: no phone linked, so the token carries no phone_number,
    // and nobody may claim a number — someone else's, say — without proving it.
    const email = uniqueEmail();
    const phone = uniquePhone();
    const idToken = await signInWithGoogleAs(email);

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send(registrationBody(email, phone, uidOf(idToken)));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/verify your phone number/);
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('refuses a number other than the one linked to the account', async () => {
    const email = uniqueEmail();
    const linked = uniquePhone();
    const idToken = await signInWithGoogleAs(email, { phoneNumber: linked });
    const other = '+201099990123';

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send(registrationBody(email, other, uidOf(idToken)));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/verify your phone number/);
    expect(await prisma.user.count({ where: { phone: other } })).toBe(0);
  });

  it('registers a Google sign-up as a nanny, pending review, with no token', async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    const idToken = await signInWithGoogleAs(email, { phoneNumber: phone });

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send({
        ...registrationBody(email, phone, uidOf(idToken)),
        role: 'NANNY',
        idDocumentType: 'PASSPORT',
        idDocumentFrontUrl: storageUrl('nanny-ids', uidOf(idToken), 'front.jpg'),
        avatarUrl: storageUrl('avatars', uidOf(idToken)),
        bio: 'Five years with toddlers, first-aid trained.',
        yearsOfExperience: 5,
        availabilityType: 'FULL_TIME',
        ageRanges: ['0-1', '1-3'],
        schedule: { '1': { available: true, startTime: '08:00', endTime: '18:00' } },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.role).toBe('NANNY');
    expect(response.body.data.isEmailVerified).toBe(true);
    expect(response.body.data.isPhoneVerified).toBe(true);
    expect(response.body.data.approvalStatus).toBe('PENDING_REVIEW');
  });
});
