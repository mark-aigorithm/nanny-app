/**
 * A25 — registration refuses what it cannot trust, and answers a double tap
 * with one account. Each case runs the real route against the Auth emulator,
 * so revocation, uid-scoped upload paths and the unique indexes are the real
 * ones, not stand-ins.
 */
import request from 'supertest';

import { CURRENT_TERMS_VERSION } from '@nanny-app/shared';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';

import { authHeader, createEmulatorUser, signInAs } from '../../../test/auth';
import { proveEmail } from '../../../test/journeys/email-verification';
import { storageUrl } from '../../../test/storage-url';

function uniquePhone(): string {
  return `+2016${String(Date.now()).slice(-8)}`;
}

function uniqueEmail(): string {
  return `a25-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

/** A mother mid-wizard: phone linked, address proven, about to call /auth/register. */
async function motherAboutToRegister() {
  const email = uniqueEmail();
  const phone = uniquePhone();
  const uid = await createEmulatorUser(email, undefined, phone);
  const token = await signInAs(email);
  const body = {
    firstName: 'Hard',
    lastName: 'Ened',
    email,
    emailVerificationToken: await proveEmail(email),
    phone,
    dateOfBirth: '1992-04-01',
    role: 'MOTHER',
    termsAcceptedVersion: CURRENT_TERMS_VERSION,
    latitude: 30.0444,
    longitude: 31.2357,
    address: '1 Test Street, Cairo',
    avatarUrl: storageUrl('avatars', uid),
  };
  return { uid, token, body, phone };
}

function register(token: string, body: Record<string, unknown>) {
  return request(app).post('/auth/register').set(...authHeader(token)).send(body);
}

describe('A25 — registration refuses what it cannot trust', () => {
  it('refuses a revoked session, saying the session has ended', async () => {
    const { uid, token, body, phone } = await motherAboutToRegister();
    // Revocation is recorded to the second; a token minted in that same second
    // would still count as fresh.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await firebaseAuth.revokeRefreshTokens(uid);

    const response = await register(token, body);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Your session has ended. Please sign in again.');
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('refuses a photo from someone else’s upload folder', async () => {
    const { token, body, phone } = await motherAboutToRegister();

    const response = await register(token, { ...body, avatarUrl: storageUrl('avatars', 'someone-else') });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Upload the photo again.');
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('refuses someone under 18', async () => {
    const { token, body, phone } = await motherAboutToRegister();
    const seventeen = `${new Date().getFullYear() - 17}-01-01`;

    const response = await register(token, { ...body, dateOfBirth: seventeen });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('You must be at least 18 to use NannyNow.');
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('answers two simultaneous registrations with the same single account', async () => {
    const { token, body, phone } = await motherAboutToRegister();

    const [first, second] = await Promise.all([register(token, body), register(token, body)]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.data.id).toBe(second.body.data.id);
    expect(await prisma.user.count({ where: { phone } })).toBe(1);
  });
});
